/**
 * Cost Analysis Skill
 *
 * コスト構造の詳細分析と最適化提案を生成
 * CFO Agent が使用
 *
 * 設計図: docs/agents-and-skills.md に「高優先度」として定義
 * 定期タスク: 月曜 10:00 (週次コストレポート)
 *
 * budget-insight との違い:
 * - budget-insight: リアルタイム監視、異常検知
 * - cost-analysis: 週次/月次分析、トレンド分析、最適化提案
 */

import { z } from 'zod';
import type { SkillSpec, SkillHandler, SkillContext } from '@ai-company-os/skill-spec';
import { ResponsibilityLevel } from '@ai-company-os/skill-spec';

/**
 * 入力スキーマ
 */
export const inputSchema = z.object({
  /** 分析期間タイプ */
  period_type: z.enum(['weekly', 'monthly', 'quarterly']).default('weekly'),

  /** 分析対象期間の終了日（省略時は今日） */
  period_end: z.string().optional(),

  /** 詳細レベル */
  detail_level: z.enum(['summary', 'detailed', 'executive']).default('summary'),

  /** 言語 */
  language: z.enum(['ja', 'en']).default('ja'),

  /** 最適化提案を含むか */
  include_recommendations: z.boolean().default(true),
});

export type Input = z.infer<typeof inputSchema>;

/**
 * コスト内訳
 */
const costBreakdownSchema = z.object({
  category: z.string(),
  amount: z.number(),
  percentage: z.number(),
  trend: z.enum(['increasing', 'stable', 'decreasing']),
});

/**
 * スキル別コスト
 */
const skillCostDetailSchema = z.object({
  skill_key: z.string(),
  skill_name: z.string(),
  executions: z.number(),
  total_cost: z.number(),
  avg_cost_per_execution: z.number(),
  cost_efficiency_score: z.number(), // 0-100
  trend: z.enum(['increasing', 'stable', 'decreasing']),
});

/**
 * 出力スキーマ
 */
export const outputSchema = z.object({
  /** 分析期間 */
  period: z.object({
    type: z.enum(['weekly', 'monthly', 'quarterly']),
    start: z.string(),
    end: z.string(),
  }),

  /** コストサマリー */
  summary: z.object({
    total_cost: z.number(),
    total_executions: z.number(),
    avg_cost_per_execution: z.number(),
    period_over_period_change: z.number(), // 前期比変化率
    budget_utilization: z.number(), // 予算消化率
    projected_monthly_cost: z.number(),
  }),

  /** カテゴリ別内訳 */
  breakdown_by_category: z.array(costBreakdownSchema),

  /** スキル別詳細 */
  top_cost_skills: z.array(skillCostDetailSchema),

  /** 異常検知 */
  anomalies: z.array(z.object({
    type: z.enum(['cost_spike', 'unusual_pattern', 'budget_overrun', 'inefficiency']),
    severity: z.enum(['high', 'medium', 'low']),
    description: z.string(),
    affected_skill: z.string().optional(),
    recommended_action: z.string(),
  })),

  /** 最適化提案 */
  recommendations: z.array(z.object({
    category: z.enum(['cost_reduction', 'efficiency', 'budget_reallocation', 'deprecation']),
    title: z.string(),
    description: z.string(),
    estimated_savings: z.number().optional(),
    priority: z.enum(['high', 'medium', 'low']),
    implementation_effort: z.enum(['low', 'medium', 'high']),
  })),

  /** エグゼクティブサマリー（人間向け） */
  executive_summary: z.object({
    headline: z.string(),
    key_insights: z.array(z.string()),
    action_items: z.array(z.string()),
  }),
});

export type Output = z.infer<typeof outputSchema>;

/**
 * スキル仕様
 */
export const spec: SkillSpec = {
  key: 'finance.cost-analysis',
  version: '1.0.0',
  name: 'コスト分析レポート',
  description: 'コスト構造の詳細分析と最適化提案を生成。週次/月次のコストトレンドを分析し、CFOの意思決定を支援。',
  category: 'finance',
  tags: ['finance', 'cost', 'analysis', 'reporting', 'optimization'],

  input: {
    schema: inputSchema._def as unknown as Record<string, unknown>,
    examples: [
      {
        period_type: 'weekly',
        detail_level: 'summary',
        include_recommendations: true,
        language: 'ja',
      },
    ],
  },

  output: {
    schema: outputSchema._def as unknown as Record<string, unknown>,
    examples: [],
  },

  cost_model: {
    fixed_cost: 0.02,
    per_token_input: 0.003,
    per_token_output: 0.015,
    estimated_tokens_input: 800,
    estimated_tokens_output: 1500,
  },

  safety: {
    requires_approval: false,
    timeout_seconds: 90,
    max_retries: 2,
    retry_delay_seconds: 15,
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

  has_external_effect: false,
  required_responsibility_level: ResponsibilityLevel.AI_WITH_REVIEW,
};

/**
 * 期間の開始日を計算
 */
function getPeriodStart(periodType: 'weekly' | 'monthly' | 'quarterly', endDate: Date): Date {
  const start = new Date(endDate);

  switch (periodType) {
    case 'weekly':
      start.setDate(start.getDate() - 7);
      break;
    case 'monthly':
      start.setMonth(start.getMonth() - 1);
      break;
    case 'quarterly':
      start.setMonth(start.getMonth() - 3);
      break;
  }

  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * トレンドを判定
 */
function determineTrend(currentValue: number, previousValue: number): 'increasing' | 'stable' | 'decreasing' {
  if (previousValue === 0) return 'stable';
  const changeRate = (currentValue - previousValue) / previousValue;

  if (changeRate > 0.1) return 'increasing';
  if (changeRate < -0.1) return 'decreasing';
  return 'stable';
}

/**
 * スキル実行ハンドラー
 */
export const execute: SkillHandler = async (
  input: Record<string, unknown>,
  context: SkillContext
) => {
  const parsed = inputSchema.parse(input);

  context.logger.info('Generating cost analysis report', {
    period_type: parsed.period_type,
    detail_level: parsed.detail_level,
  });

  // 期間を計算
  const periodEnd = parsed.period_end ? new Date(parsed.period_end) : new Date();
  const periodStart = getPeriodStart(parsed.period_type, periodEnd);

  // プレースホルダーデータ（実際はDB集計結果を使用）
  const summary = {
    total_cost: 0,
    total_executions: 0,
    avg_cost_per_execution: 0,
    period_over_period_change: 0,
    budget_utilization: 0,
    projected_monthly_cost: 0,
  };

  const breakdownByCategory: Array<{
    category: string;
    amount: number;
    percentage: number;
    trend: 'increasing' | 'stable' | 'decreasing';
  }> = [
    { category: 'governance', amount: 0, percentage: 0, trend: 'stable' },
    { category: 'operations', amount: 0, percentage: 0, trend: 'stable' },
    { category: 'engineering', amount: 0, percentage: 0, trend: 'stable' },
    { category: 'finance', amount: 0, percentage: 0, trend: 'stable' },
  ];

  const topCostSkills: Array<{
    skill_key: string;
    skill_name: string;
    executions: number;
    total_cost: number;
    avg_cost_per_execution: number;
    cost_efficiency_score: number;
    trend: 'increasing' | 'stable' | 'decreasing';
  }> = [];

  const anomalies: Array<{
    type: 'cost_spike' | 'unusual_pattern' | 'budget_overrun' | 'inefficiency';
    severity: 'high' | 'medium' | 'low';
    description: string;
    affected_skill?: string;
    recommended_action: string;
  }> = [];

  const recommendations: Array<{
    category: 'cost_reduction' | 'efficiency' | 'budget_reallocation' | 'deprecation';
    title: string;
    description: string;
    estimated_savings?: number;
    priority: 'high' | 'medium' | 'low';
    implementation_effort: 'low' | 'medium' | 'high';
  }> = [];

  // 提案を含める場合
  if (parsed.include_recommendations) {
    if (summary.total_cost === 0) {
      recommendations.push({
        category: 'efficiency',
        title: 'コストデータの収集開始',
        description: '分析期間内のコストデータがありません。スキル実行とコスト計測を開始してください。',
        priority: 'medium',
        implementation_effort: 'low',
      });
    }
  }

  // エグゼクティブサマリー生成
  const executiveSummary = {
    headline: summary.total_cost === 0
      ? '分析対象期間のコストデータがありません'
      : `総コスト ${summary.total_cost.toFixed(2)} USD（前期比 ${(summary.period_over_period_change * 100).toFixed(1)}%）`,
    key_insights: summary.total_cost === 0
      ? ['スキル実行が記録されていません']
      : ['コスト構造は安定しています'],
    action_items: recommendations.map(r => r.title),
  };

  const output: Output = {
    period: {
      type: parsed.period_type,
      start: periodStart.toISOString().split('T')[0],
      end: periodEnd.toISOString().split('T')[0],
    },
    summary,
    breakdown_by_category: breakdownByCategory,
    top_cost_skills: topCostSkills,
    anomalies,
    recommendations,
    executive_summary: executiveSummary,
  };

  context.logger.info('Cost analysis report generated', {
    period_type: parsed.period_type,
    total_cost: summary.total_cost,
    anomalies_count: anomalies.length,
    recommendations_count: recommendations.length,
  });

  return {
    output,
    actual_cost: spec.cost_model.fixed_cost,
    metadata: {
      report_type: 'cost_analysis',
    },
  };
};
