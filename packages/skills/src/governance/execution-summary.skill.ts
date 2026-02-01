/**
 * Execution Summary Skill
 *
 * AI Company OS 上で発生した execution を集計し、
 * 経営者向けに日次/週次/任意期間の要約を生成する。
 *
 * 設計原則：
 * - 結論は出さず「事実の要約」に徹する
 * - 判断材料のみを提供し、意思決定は人間が行う
 * - 監査可能な形式で出力する
 */

import { z } from 'zod';
import type { SkillSpec, SkillHandler, SkillContext } from '@ai-company-os/skill-spec';
import { ResponsibilityLevel } from '@ai-company-os/skill-spec';

/**
 * 入力スキーマ
 */
export const inputSchema = z.object({
  /** 集計期間開始日 (ISO 8601) */
  period_start: z.string().datetime(),

  /** 集計期間終了日 (ISO 8601) */
  period_end: z.string().datetime(),

  /** 集計タイプ */
  summary_type: z.enum(['daily', 'weekly', 'monthly', 'custom']).default('daily'),

  /** フィルタ条件（オプション） */
  filters: z
    .object({
      skill_keys: z.array(z.string()).optional(),
      executor_types: z.array(z.enum(['user', 'agent', 'system'])).optional(),
      states: z.array(z.string()).optional(),
    })
    .optional(),

  /** 言語 */
  language: z.enum(['ja', 'en']).default('ja'),
});

export type Input = z.infer<typeof inputSchema>;

/**
 * 実行統計
 */
const executionStatsSchema = z.object({
  total_count: z.number(),
  by_state: z.record(z.string(), z.number()),
  success_count: z.number(),
  failure_count: z.number(),
  timeout_count: z.number(),
  cancelled_count: z.number(),
  success_rate: z.number(),
});

/**
 * スキル使用統計
 */
const skillUsageSchema = z.object({
  skill_key: z.string(),
  skill_name: z.string(),
  execution_count: z.number(),
  success_count: z.number(),
  failure_count: z.number(),
  total_cost: z.number(),
});

/**
 * 責任者統計
 */
const responsibleUserSchema = z.object({
  user_id: z.string(),
  execution_count: z.number(),
  approved_count: z.number(),
  total_cost_responsible: z.number(),
});

/**
 * 予算使用統計
 */
const budgetUsageSchema = z.object({
  total_reserved: z.number(),
  total_consumed: z.number(),
  total_released: z.number(),
  currency: z.string(),
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
    summary_type: z.string(),
    tenant_id: z.string(),
  }),

  /** 実行統計 */
  execution_stats: executionStatsSchema,

  /** スキル別使用統計 */
  skill_usage: z.array(skillUsageSchema),

  /** 責任者別統計 */
  responsible_users: z.array(responsibleUserSchema),

  /** 予算使用統計 */
  budget_usage: budgetUsageSchema,

  /** 監査ログ要約 */
  audit_summary: z.object({
    total_log_entries: z.number(),
    actions_breakdown: z.record(z.string(), z.number()),
  }),

  /** 注意事項（事実のみ、判断なし） */
  notices: z.array(
    z.object({
      type: z.enum(['info', 'warning']),
      message: z.string(),
      data: z.record(z.unknown()).optional(),
    })
  ),
});

export type Output = z.infer<typeof outputSchema>;

/**
 * スキル仕様
 */
export const spec: SkillSpec = {
  key: 'governance.execution-summary',
  version: '1.0.0',
  name: '実行サマリーレポート',
  description:
    'AI Company OS上で発生した実行を集計し、経営者向けに期間要約を生成します。結論は出さず事実の要約に徹します。',
  category: 'governance',
  tags: ['governance', 'reporting', 'execution', 'summary', 'audit'],

  input: {
    schema: inputSchema._def as unknown as Record<string, unknown>,
    examples: [
      {
        period_start: '2024-01-01T00:00:00Z',
        period_end: '2024-01-07T23:59:59Z',
        summary_type: 'weekly',
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
    estimated_tokens_input: 500,
    estimated_tokens_output: 1000,
  },

  safety: {
    // 経営情報を扱うため承認必須
    requires_approval: true,
    timeout_seconds: 120,
    max_retries: 2,
    retry_delay_seconds: 10,
  },

  pii_policy: {
    // user_id は含まれるが、メールアドレス等の直接的なPIIは含まない
    input_contains_pii: false,
    output_contains_pii: false,
    pii_fields: [],
    handling: 'REJECT',
  },

  llm_policy: {
    training_opt_out: true,
    data_retention_days: 0,
    allowed_models: ['claude-sonnet-4-20250514'],
    max_context_tokens: 50000,
  },

  // DB読み取りのみ、外部影響なし
  has_external_effect: false,

  // 経営情報のため人間の承認が必要
  required_responsibility_level: ResponsibilityLevel.HUMAN_APPROVED,
};

/**
 * スキル実行ハンドラー
 *
 * 注意：このスキルはDBアクセスが必要なため、
 * 実際のクエリはRunner側で実行し、結果がinputに含まれる設計とする。
 * ここではデータ整形とレポート生成のみを行う。
 */
export const execute: SkillHandler = async (
  input: Record<string, unknown>,
  context: SkillContext
) => {
  const parsed = inputSchema.parse(input);

  context.logger.info('Generating execution summary report', {
    period_start: parsed.period_start,
    period_end: parsed.period_end,
    summary_type: parsed.summary_type,
  });

  // 期間検証
  const startDate = new Date(parsed.period_start);
  const endDate = new Date(parsed.period_end);
  if (startDate >= endDate) {
    throw new Error('period_start must be before period_end');
  }

  // この時点ではDBアクセスができないため、
  // 実際の実装ではRunner経由でデータを取得する必要がある。
  // 以下はレポート構造の定義とフォーマット処理。

  // プレースホルダーデータ（実際はRunner経由でDB集計結果を受け取る）
  const executionStats = {
    total_count: 0,
    by_state: {} as Record<string, number>,
    success_count: 0,
    failure_count: 0,
    timeout_count: 0,
    cancelled_count: 0,
    success_rate: 0,
  };

  const skillUsage: Array<{
    skill_key: string;
    skill_name: string;
    execution_count: number;
    success_count: number;
    failure_count: number;
    total_cost: number;
  }> = [];

  const responsibleUsers: Array<{
    user_id: string;
    execution_count: number;
    approved_count: number;
    total_cost_responsible: number;
  }> = [];

  const budgetUsage = {
    total_reserved: 0,
    total_consumed: 0,
    total_released: 0,
    currency: 'USD',
  };

  const auditSummary = {
    total_log_entries: 0,
    actions_breakdown: {} as Record<string, number>,
  };

  // 注意事項の生成（事実ベースのみ）
  const notices: Array<{
    type: 'info' | 'warning';
    message: string;
    data?: Record<string, unknown>;
  }> = [];

  // 失敗率が高い場合の事実通知（判断は含めない）
  if (executionStats.total_count > 0) {
    const failureRate =
      (executionStats.failure_count + executionStats.timeout_count) /
      executionStats.total_count;
    if (failureRate > 0.1) {
      notices.push({
        type: 'warning',
        message:
          parsed.language === 'ja'
            ? `失敗・タイムアウト率が${(failureRate * 100).toFixed(1)}%です`
            : `Failure/timeout rate is ${(failureRate * 100).toFixed(1)}%`,
        data: {
          failure_count: executionStats.failure_count,
          timeout_count: executionStats.timeout_count,
          total_count: executionStats.total_count,
        },
      });
    }
  }

  const output: Output = {
    report_metadata: {
      generated_at: new Date().toISOString(),
      period_start: parsed.period_start,
      period_end: parsed.period_end,
      summary_type: parsed.summary_type,
      tenant_id: context.tenant_id,
    },
    execution_stats: executionStats,
    skill_usage: skillUsage,
    responsible_users: responsibleUsers,
    budget_usage: budgetUsage,
    audit_summary: auditSummary,
    notices,
  };

  context.logger.info('Execution summary report generated', {
    total_executions: executionStats.total_count,
    notices_count: notices.length,
  });

  return {
    output,
    actual_cost: spec.cost_model.fixed_cost,
    metadata: {
      report_type: 'execution_summary',
      period_days: Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      ),
    },
  };
};
