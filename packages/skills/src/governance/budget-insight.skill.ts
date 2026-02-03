/**
 * Cost / Budget Insight Skill
 *
 * スキル別・エージェント別のコスト構造を可視化し、
 * 異常値（急増・偏り）を検知する。
 *
 * 設計原則：
 * - Reserve / Consume / Release の整合性チェック
 * - 期間比較（前週比・前日比）
 * - 異常検知は通知のみ（自動停止しない）
 * - 判断は人間が行う
 */

import { z } from 'zod';
import type { SkillSpec, SkillHandler, SkillContext } from '@ai-company-os/skill-spec';
import { ResponsibilityLevel } from '@ai-company-os/skill-spec';

/**
 * 入力スキーマ
 */
export const inputSchema = z.object({
  /** 分析期間開始日 (ISO 8601) */
  period_start: z.string().datetime(),

  /** 分析期間終了日 (ISO 8601) */
  period_end: z.string().datetime(),

  /** 比較期間タイプ */
  comparison_type: z.enum(['previous_period', 'previous_week', 'previous_month']).optional(),

  /** 分析の粒度 */
  granularity: z.enum(['daily', 'weekly', 'monthly']).default('daily'),

  /** 異常検知の閾値設定 */
  anomaly_thresholds: z
    .object({
      /** コスト増加率の警告閾値（例: 0.5 = 50%増） */
      cost_increase_warning: z.number().min(0).max(10).default(0.5),
      /** コスト増加率の危険閾値 */
      cost_increase_critical: z.number().min(0).max(10).default(1.0),
      /** 予約未消費率の警告閾値 */
      unreleased_reservation_warning: z.number().min(0).max(1).default(0.1),
    })
    .optional(),

  /** 言語 */
  language: z.enum(['ja', 'en']).default('ja'),
});

export type Input = z.infer<typeof inputSchema>;

/**
 * スキル別コスト
 */
const skillCostSchema = z.object({
  skill_key: z.string(),
  skill_name: z.string(),
  execution_count: z.number(),
  total_reserved: z.number(),
  total_consumed: z.number(),
  total_released: z.number(),
  average_cost_per_execution: z.number(),
  cost_variance: z.number(),
});

/**
 * エージェント別コスト
 */
const agentCostSchema = z.object({
  executor_type: z.enum(['user', 'agent', 'system']),
  executor_id: z.string(),
  execution_count: z.number(),
  total_consumed: z.number(),
  skill_breakdown: z.array(
    z.object({
      skill_key: z.string(),
      cost: z.number(),
      count: z.number(),
    })
  ),
});

/**
 * 期間比較
 */
const periodComparisonSchema = z.object({
  current_period: z.object({
    start: z.string(),
    end: z.string(),
    total_cost: z.number(),
    execution_count: z.number(),
  }),
  previous_period: z
    .object({
      start: z.string(),
      end: z.string(),
      total_cost: z.number(),
      execution_count: z.number(),
    })
    .optional(),
  cost_change_rate: z.number().optional(),
  execution_change_rate: z.number().optional(),
});

/**
 * 整合性チェック結果
 */
const consistencyCheckSchema = z.object({
  total_reserved: z.number(),
  total_consumed: z.number(),
  total_released: z.number(),
  unreleased_amount: z.number(),
  unreleased_reservations_count: z.number(),
  is_consistent: z.boolean(),
  discrepancies: z.array(
    z.object({
      reservation_id: z.string(),
      expected_state: z.string(),
      actual_state: z.string(),
      amount: z.number(),
    })
  ),
});

/**
 * 異常検知結果
 */
const anomalySchema = z.object({
  type: z.enum(['cost_spike', 'unusual_pattern', 'reservation_leak', 'budget_exceeded']),
  severity: z.enum(['info', 'warning', 'critical']),
  message: z.string(),
  data: z.record(z.unknown()),
  detected_at: z.string(),
});

/**
 * 出力スキーマ
 */
export const outputSchema = z.object({
  /** レポートメタデータ */
  report_metadata: z.object({
    generated_at: z.string(),
    period_start: z.string(),
    period_end: z.string(),
    granularity: z.string(),
    tenant_id: z.string(),
    currency: z.string(),
  }),

  /** 予算概要 */
  budget_overview: z.object({
    total_limit: z.number(),
    total_used: z.number(),
    total_reserved: z.number(),
    available: z.number(),
    utilization_rate: z.number(),
  }),

  /** スキル別コスト */
  cost_by_skill: z.array(skillCostSchema),

  /** エージェント別コスト */
  cost_by_agent: z.array(agentCostSchema),

  /** 期間比較 */
  period_comparison: periodComparisonSchema,

  /** 整合性チェック */
  consistency_check: consistencyCheckSchema,

  /** 検知された異常（通知のみ、自動対応なし） */
  anomalies: z.array(anomalySchema),

  /** 日別推移 */
  daily_trend: z.array(
    z.object({
      date: z.string(),
      total_cost: z.number(),
      execution_count: z.number(),
    })
  ),
});

export type Output = z.infer<typeof outputSchema>;

/**
 * スキル仕様
 */
export const spec: SkillSpec = {
  key: 'governance.budget-insight',
  version: '1.0.0',
  name: '予算・コスト分析',
  description:
    'スキル別・エージェント別のコスト構造を可視化し、異常値を検知します。検知は通知のみで自動停止は行いません。',
  category: 'governance',
  tags: ['governance', 'budget', 'cost', 'anomaly-detection', 'reporting'],

  input: {
    schema: inputSchema._def as unknown as Record<string, unknown>,
    examples: [
      {
        period_start: '2024-01-01T00:00:00Z',
        period_end: '2024-01-07T23:59:59Z',
        comparison_type: 'previous_week',
        granularity: 'daily',
        language: 'ja',
      },
    ],
  },

  output: {
    schema: outputSchema._def as unknown as Record<string, unknown>,
    examples: [],
  },

  cost_model: {
    fixed_cost: 0.01,
    per_token_input: 0.003,
    per_token_output: 0.015,
    estimated_tokens_input: 300,
    estimated_tokens_output: 800,
  },

  safety: {
    // 予算情報を扱うため承認必須
    requires_approval: true,
    timeout_seconds: 90,
    max_retries: 2,
    retry_delay_seconds: 10,
  },

  pii_policy: {
    input_contains_pii: false,
    output_contains_pii: false,
    pii_fields: [],
    handling: 'REJECT',
  },

  llm_policy: {
    training_opt_out: true,
    data_retention_days: 0,
    allowed_models: ['claude-sonnet-4-20250514'],
    max_context_tokens: 30000,
  },

  // DB読み取りのみ、外部影響なし
  has_external_effect: false,

  // 予算情報のため人間の承認が必要
  required_responsibility_level: ResponsibilityLevel.HUMAN_APPROVED,
};

/**
 * スキル実行ハンドラー
 */
export const execute: SkillHandler = async (
  input: Record<string, unknown>,
  context: SkillContext
) => {
  const parsed = inputSchema.parse(input);

  context.logger.info('Generating budget insight report', {
    period_start: parsed.period_start,
    period_end: parsed.period_end,
    granularity: parsed.granularity,
  });

  // 期間検証
  const startDate = new Date(parsed.period_start);
  const endDate = new Date(parsed.period_end);
  if (startDate >= endDate) {
    throw new Error('period_start must be before period_end');
  }

  // デフォルト閾値
  const thresholds = {
    cost_increase_warning: parsed.anomaly_thresholds?.cost_increase_warning ?? 0.5,
    cost_increase_critical: parsed.anomaly_thresholds?.cost_increase_critical ?? 1.0,
    unreleased_reservation_warning:
      parsed.anomaly_thresholds?.unreleased_reservation_warning ?? 0.1,
  };

  // プレースホルダーデータ（実際はRunner経由でDB集計結果を受け取る）
  const budgetOverview = {
    total_limit: 0,
    total_used: 0,
    total_reserved: 0,
    available: 0,
    utilization_rate: 0,
  };

  const costBySkill: Array<{
    skill_key: string;
    skill_name: string;
    execution_count: number;
    total_reserved: number;
    total_consumed: number;
    total_released: number;
    average_cost_per_execution: number;
    cost_variance: number;
  }> = [];

  const costByAgent: Array<{
    executor_type: 'user' | 'agent' | 'system';
    executor_id: string;
    execution_count: number;
    total_consumed: number;
    skill_breakdown: Array<{
      skill_key: string;
      cost: number;
      count: number;
    }>;
  }> = [];

  const periodComparison = {
    current_period: {
      start: parsed.period_start,
      end: parsed.period_end,
      total_cost: 0,
      execution_count: 0,
    },
    previous_period: undefined as
      | {
          start: string;
          end: string;
          total_cost: number;
          execution_count: number;
        }
      | undefined,
    cost_change_rate: undefined as number | undefined,
    execution_change_rate: undefined as number | undefined,
  };

  const consistencyCheck = {
    total_reserved: 0,
    total_consumed: 0,
    total_released: 0,
    unreleased_amount: 0,
    unreleased_reservations_count: 0,
    is_consistent: true,
    discrepancies: [] as Array<{
      reservation_id: string;
      expected_state: string;
      actual_state: string;
      amount: number;
    }>,
  };

  // 異常検知（通知のみ、自動対応なし）
  const anomalies: Array<{
    type: 'cost_spike' | 'unusual_pattern' | 'reservation_leak' | 'budget_exceeded';
    severity: 'info' | 'warning' | 'critical';
    message: string;
    data: Record<string, unknown>;
    detected_at: string;
  }> = [];

  // 未解放予約の検知
  if (consistencyCheck.unreleased_amount > 0) {
    const unreleasedRate =
      consistencyCheck.total_reserved > 0
        ? consistencyCheck.unreleased_amount / consistencyCheck.total_reserved
        : 0;

    if (unreleasedRate > thresholds.unreleased_reservation_warning) {
      anomalies.push({
        type: 'reservation_leak',
        severity: 'warning',
        message:
          parsed.language === 'ja'
            ? `未解放の予約が${consistencyCheck.unreleased_reservations_count}件（${consistencyCheck.unreleased_amount.toFixed(2)} USD）あります`
            : `${consistencyCheck.unreleased_reservations_count} unreleased reservations (${consistencyCheck.unreleased_amount.toFixed(2)} USD)`,
        data: {
          unreleased_count: consistencyCheck.unreleased_reservations_count,
          unreleased_amount: consistencyCheck.unreleased_amount,
          unreleased_rate: unreleasedRate,
        },
        detected_at: new Date().toISOString(),
      });
    }
  }

  // 予算超過の検知
  if (budgetOverview.total_limit > 0) {
    if (budgetOverview.total_used > budgetOverview.total_limit) {
      anomalies.push({
        type: 'budget_exceeded',
        severity: 'critical',
        message:
          parsed.language === 'ja'
            ? `予算上限を超過しています（使用: ${budgetOverview.total_used.toFixed(2)} / 上限: ${budgetOverview.total_limit.toFixed(2)} USD）`
            : `Budget exceeded (Used: ${budgetOverview.total_used.toFixed(2)} / Limit: ${budgetOverview.total_limit.toFixed(2)} USD)`,
        data: {
          total_used: budgetOverview.total_used,
          total_limit: budgetOverview.total_limit,
          overage: budgetOverview.total_used - budgetOverview.total_limit,
        },
        detected_at: new Date().toISOString(),
      });
    }
  }

  const dailyTrend: Array<{
    date: string;
    total_cost: number;
    execution_count: number;
  }> = [];

  // 注入データから日別トレンドを構築
  const injectedData = input._budget_data as {
    budget?: {
      limit_amount: number;
      used_amount: number;
      reserved_amount: number;
    };
    daily_costs?: Array<{
      date: string;
      cost: number;
      executions: number;
    }>;
    skill_costs?: Array<{
      skill_key: string;
      skill_name: string;
      execution_count: number;
      total_cost: number;
    }>;
    agent_costs?: Array<{
      executor_type: 'user' | 'agent' | 'system';
      executor_id: string;
      execution_count: number;
      total_cost: number;
    }>;
  } | undefined;

  // 注入データがあれば更新
  if (injectedData?.budget) {
    budgetOverview.total_limit = injectedData.budget.limit_amount;
    budgetOverview.total_used = injectedData.budget.used_amount;
    budgetOverview.total_reserved = injectedData.budget.reserved_amount;
    budgetOverview.available = budgetOverview.total_limit - budgetOverview.total_used - budgetOverview.total_reserved;
    budgetOverview.utilization_rate = budgetOverview.total_limit > 0
      ? (budgetOverview.total_used / budgetOverview.total_limit) * 100
      : 0;
  }

  if (injectedData?.daily_costs) {
    for (const dc of injectedData.daily_costs) {
      dailyTrend.push({
        date: dc.date,
        total_cost: dc.cost,
        execution_count: dc.executions,
      });
    }
  }

  if (injectedData?.skill_costs) {
    for (const sc of injectedData.skill_costs) {
      costBySkill.push({
        skill_key: sc.skill_key,
        skill_name: sc.skill_name,
        execution_count: sc.execution_count,
        total_reserved: 0,
        total_consumed: sc.total_cost,
        total_released: 0,
        average_cost_per_execution: sc.execution_count > 0 ? sc.total_cost / sc.execution_count : 0,
        cost_variance: 0,
      });
    }
  }

  if (injectedData?.agent_costs) {
    for (const ac of injectedData.agent_costs) {
      costByAgent.push({
        executor_type: ac.executor_type,
        executor_id: ac.executor_id,
        execution_count: ac.execution_count,
        total_consumed: ac.total_cost,
        skill_breakdown: [],
      });
    }
  }

  // LLMを使用して異常検知の分析コメントを生成
  if (anomalies.length > 0 || costBySkill.length > 0) {
    try {
      const systemPrompt = parsed.language === 'ja'
        ? `あなたは予算管理の専門家です。コストデータを分析し、異常や懸念点を検出します。
結論・推奨は出さず、事実に基づいた分析のみを行ってください。`
        : `You are a budget management expert. Analyze cost data and detect anomalies or concerns.
Do not make recommendations, only fact-based analysis.`;

      const userPrompt = parsed.language === 'ja'
        ? `以下のコストデータを分析し、追加の異常や懸念点があれば報告してください。

【予算概要】
- 上限: ${budgetOverview.total_limit.toFixed(2)} USD
- 使用済み: ${budgetOverview.total_used.toFixed(2)} USD
- 利用率: ${budgetOverview.utilization_rate.toFixed(1)}%

【スキル別コスト】
${costBySkill.slice(0, 5).map(s => `- ${s.skill_key}: ${s.total_consumed.toFixed(2)} USD (${s.execution_count}回)`).join('\n') || 'なし'}

【検知済み異常】
${anomalies.map(a => `- ${a.type}: ${a.message}`).join('\n') || 'なし'}

JSON形式で返してください:
{"additional_anomalies": [{"type": "cost_spike|unusual_pattern", "severity": "info|warning|critical", "message": "説明"}]}`
        : `Analyze the following cost data and report any additional anomalies or concerns.

【Budget Overview】
- Limit: ${budgetOverview.total_limit.toFixed(2)} USD
- Used: ${budgetOverview.total_used.toFixed(2)} USD
- Utilization: ${budgetOverview.utilization_rate.toFixed(1)}%

【Cost by Skill】
${costBySkill.slice(0, 5).map(s => `- ${s.skill_key}: ${s.total_consumed.toFixed(2)} USD (${s.execution_count} times)`).join('\n') || 'None'}

【Detected Anomalies】
${anomalies.map(a => `- ${a.type}: ${a.message}`).join('\n') || 'None'}

Return in JSON format:
{"additional_anomalies": [{"type": "cost_spike|unusual_pattern", "severity": "info|warning|critical", "message": "description"}]}`;

      const response = await context.llm.chat({
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: 800,
        temperature: 0.2,
      });

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        if (result.additional_anomalies) {
          for (const a of result.additional_anomalies) {
            anomalies.push({
              type: a.type || 'unusual_pattern',
              severity: a.severity || 'info',
              message: a.message || '',
              data: {},
              detected_at: new Date().toISOString(),
            });
          }
        }
      }
    } catch (error) {
      context.logger.warn('Failed to analyze anomalies via LLM', { error });
    }
  }

  const output: Output = {
    report_metadata: {
      generated_at: new Date().toISOString(),
      period_start: parsed.period_start,
      period_end: parsed.period_end,
      granularity: parsed.granularity,
      tenant_id: context.tenant_id,
      currency: 'USD',
    },
    budget_overview: budgetOverview,
    cost_by_skill: costBySkill,
    cost_by_agent: costByAgent,
    period_comparison: periodComparison,
    consistency_check: consistencyCheck,
    anomalies,
    daily_trend: dailyTrend,
  };

  context.logger.info('Budget insight report generated', {
    anomalies_count: anomalies.length,
    is_consistent: consistencyCheck.is_consistent,
  });

  return {
    output,
    actual_cost: spec.cost_model.fixed_cost,
    metadata: {
      report_type: 'budget_insight',
      anomalies_detected: anomalies.length,
      thresholds_used: thresholds,
    },
  };
};
