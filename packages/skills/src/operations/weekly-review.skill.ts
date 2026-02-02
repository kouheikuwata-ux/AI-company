/**
 * Weekly Review Skill
 *
 * 週次オペレーションレビューを生成
 * COO Agent が使用
 *
 * 設計図: docs/agents-and-skills.md に「高優先度」として定義
 * 定期タスク: 金曜 16:00
 */

import { z } from 'zod';
import type { SkillSpec, SkillHandler, SkillContext } from '@ai-company-os/skill-spec';
import { ResponsibilityLevel } from '@ai-company-os/skill-spec';

/**
 * 入力スキーマ
 */
export const inputSchema = z.object({
  /** レビュー対象週の開始日（ISO形式） */
  week_start: z.string().optional(),

  /** 詳細レベル（summary/detailed） */
  detail_level: z.enum(['summary', 'detailed']).default('summary'),

  /** 言語 */
  language: z.enum(['ja', 'en']).default('ja'),

  /** 来週への提案を含むか */
  include_recommendations: z.boolean().default(true),
});

export type Input = z.infer<typeof inputSchema>;

/**
 * 出力スキーマ
 */
export const outputSchema = z.object({
  /** レビュー期間 */
  period: z.object({
    start: z.string(),
    end: z.string(),
  }),

  /** 週次サマリー */
  summary: z.object({
    total_executions: z.number(),
    successful_executions: z.number(),
    failed_executions: z.number(),
    success_rate: z.number(),
    total_cost: z.number(),
    active_skills: z.number(),
    active_agents: z.number(),
  }),

  /** 前週比較 */
  week_over_week: z.object({
    executions_change: z.number(),
    success_rate_change: z.number(),
    cost_change: z.number(),
    trend: z.enum(['improving', 'stable', 'degrading']),
  }),

  /** トップパフォーマンススキル */
  top_performers: z.array(z.object({
    skill_key: z.string(),
    executions: z.number(),
    success_rate: z.number(),
  })),

  /** 要注意事項 */
  attention_items: z.array(z.object({
    type: z.enum(['high_failure_rate', 'cost_spike', 'unused_skill', 'pending_approval']),
    severity: z.enum(['high', 'medium', 'low']),
    description: z.string(),
    recommended_action: z.string(),
  })),

  /** 来週への提案 */
  recommendations: z.array(z.object({
    category: z.enum(['optimization', 'monitoring', 'deprecation', 'new_feature']),
    title: z.string(),
    description: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
  })),

  /** 所見 */
  notes: z.array(z.string()),
});

export type Output = z.infer<typeof outputSchema>;

/**
 * スキル仕様
 */
export const spec: SkillSpec = {
  key: 'operations.weekly-review',
  version: '1.0.0',
  name: '週次オペレーションレビュー',
  description: '週次のオペレーション状況をレビュー。実行状況、トレンド、来週への提案を生成。',
  category: 'operations',
  tags: ['operations', 'reporting', 'weekly', 'review', 'analysis'],

  input: {
    schema: inputSchema._def as unknown as Record<string, unknown>,
    examples: [
      {
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
    fixed_cost: 0.01,
    per_token_input: 0.003,
    per_token_output: 0.015,
    estimated_tokens_input: 500,
    estimated_tokens_output: 1000,
  },

  safety: {
    requires_approval: false,
    timeout_seconds: 60,
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
    max_context_tokens: 20000,
  },

  has_external_effect: false,
  required_responsibility_level: ResponsibilityLevel.AI_WITH_REVIEW,
};

/**
 * 週の開始日を計算（月曜日）
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * 週の終了日を計算（日曜日）
 */
function getWeekEnd(weekStart: Date): Date {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * トレンドを判定
 */
function determineTrend(
  executionsChange: number,
  successRateChange: number
): 'improving' | 'stable' | 'degrading' {
  if (successRateChange > 0.05 || (executionsChange > 0.1 && successRateChange >= 0)) {
    return 'improving';
  }
  if (successRateChange < -0.05 || (executionsChange < -0.1 && successRateChange < 0)) {
    return 'degrading';
  }
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

  context.logger.info('Generating weekly review', {
    week_start: parsed.week_start,
    detail_level: parsed.detail_level,
  });

  // 週の期間を計算
  const now = new Date();
  const weekStart = parsed.week_start
    ? new Date(parsed.week_start)
    : getWeekStart(now);
  const weekEnd = getWeekEnd(weekStart);

  // プレースホルダーデータ（実際はDB集計結果を使用）
  const summary = {
    total_executions: 0,
    successful_executions: 0,
    failed_executions: 0,
    success_rate: 1.0,
    total_cost: 0,
    active_skills: 6,
    active_agents: 4,
  };

  const weekOverWeek = {
    executions_change: 0,
    success_rate_change: 0,
    cost_change: 0,
    trend: determineTrend(0, 0),
  };

  const topPerformers: Array<{
    skill_key: string;
    executions: number;
    success_rate: number;
  }> = [];

  const attentionItems: Array<{
    type: 'high_failure_rate' | 'cost_spike' | 'unused_skill' | 'pending_approval';
    severity: 'high' | 'medium' | 'low';
    description: string;
    recommended_action: string;
  }> = [];

  const recommendations: Array<{
    category: 'optimization' | 'monitoring' | 'deprecation' | 'new_feature';
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
  }> = [];

  // 提案を含める場合
  if (parsed.include_recommendations) {
    if (summary.total_executions === 0) {
      recommendations.push({
        category: 'monitoring',
        title: '実行状況の確認',
        description: '今週のスキル実行がありません。エージェントの定期タスク設定を確認してください。',
        priority: 'medium',
      });
    }
  }

  const notes: string[] = [];
  if (summary.total_executions === 0) {
    notes.push('今週のスキル実行はありませんでした。');
  }
  if (weekOverWeek.trend === 'improving') {
    notes.push('前週と比較してオペレーションが改善しています。');
  }
  if (notes.length === 0) {
    notes.push('今週のオペレーションは安定していました。');
  }

  const output: Output = {
    period: {
      start: weekStart.toISOString().split('T')[0],
      end: weekEnd.toISOString().split('T')[0],
    },
    summary,
    week_over_week: weekOverWeek,
    top_performers: topPerformers,
    attention_items: attentionItems,
    recommendations,
    notes,
  };

  context.logger.info('Weekly review generated', {
    period_start: output.period.start,
    period_end: output.period.end,
    attention_items_count: attentionItems.length,
  });

  return {
    output,
    actual_cost: spec.cost_model.fixed_cost,
    metadata: {
      report_type: 'weekly_review',
    },
  };
};
