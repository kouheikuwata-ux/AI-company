/**
 * Daily Standup Skill
 *
 * 毎日の朝会レポートを生成
 * COO Agent が使用
 */

import { z } from 'zod';
import type { SkillSpec, SkillHandler, SkillContext } from '@ai-company-os/skill-spec';
import { ResponsibilityLevel } from '@ai-company-os/skill-spec';

/**
 * 入力スキーマ
 */
export const inputSchema = z.object({
  date: z.string().optional(),
  include_blockers: z.boolean().default(true),
  include_metrics: z.boolean().default(true),
  language: z.enum(['ja', 'en']).default('ja'),
});

export type Input = z.infer<typeof inputSchema>;

/**
 * 出力スキーマ
 */
export const outputSchema = z.object({
  report_date: z.string(),
  yesterday_summary: z.object({
    total_executions: z.number(),
    successful: z.number(),
    failed: z.number(),
  }),
  blockers: z.array(z.object({
    type: z.string(),
    description: z.string(),
  })),
  metrics_snapshot: z.object({
    active_skills: z.number(),
    pending_approvals: z.number(),
    system_health: z.enum(['healthy', 'degraded', 'critical']),
  }),
  notices: z.array(z.string()),
});

export type Output = z.infer<typeof outputSchema>;

/**
 * スキル仕様
 */
export const spec: SkillSpec = {
  key: 'operations.daily-standup',
  version: '1.0.0',
  name: '朝会レポート生成',
  description: '毎日の朝会用レポートを生成。昨日の実行状況、ブロッカー、メトリクスを整理。',
  category: 'operations',
  tags: ['operations', 'reporting', 'daily', 'standup'],

  input: {
    schema: inputSchema._def as unknown as Record<string, unknown>,
    examples: [
      {
        include_blockers: true,
        include_metrics: true,
        language: 'ja',
      },
    ],
  },

  output: {
    schema: outputSchema._def as unknown as Record<string, unknown>,
    examples: [],
  },

  cost_model: {
    fixed_cost: 0.005,
    per_token_input: 0.003,
    per_token_output: 0.015,
    estimated_tokens_input: 200,
    estimated_tokens_output: 500,
  },

  safety: {
    requires_approval: false,
    timeout_seconds: 30,
    max_retries: 1,
    retry_delay_seconds: 5,
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
    max_context_tokens: 10000,
  },

  has_external_effect: false,
  required_responsibility_level: ResponsibilityLevel.AI_WITH_REVIEW,
};

/**
 * スキル実行ハンドラー
 */
export const execute: SkillHandler = async (
  input: Record<string, unknown>,
  context: SkillContext
) => {
  const parsed = inputSchema.parse(input);

  context.logger.info('Generating daily standup report', {
    date: parsed.date,
    include_blockers: parsed.include_blockers,
  });

  const reportDate = parsed.date || new Date().toISOString().split('T')[0];

  // プレースホルダーデータ（実際はDB集計結果を使用）
  const yesterdaySummary = {
    total_executions: 0,
    successful: 0,
    failed: 0,
  };

  const blockers: Array<{ type: string; description: string }> = [];

  const metricsSnapshot = {
    active_skills: 4,
    pending_approvals: 0,
    system_health: 'healthy' as const,
  };

  const notices: string[] = [];

  if (yesterdaySummary.failed > 0) {
    notices.push(`昨日${yesterdaySummary.failed}件の実行が失敗しました。`);
  }

  if (blockers.length > 0) {
    notices.push(`${blockers.length}件のブロッカーがあります。`);
  }

  if (notices.length === 0) {
    notices.push('特に問題ありません。');
  }

  const output: Output = {
    report_date: reportDate,
    yesterday_summary: yesterdaySummary,
    blockers,
    metrics_snapshot: metricsSnapshot,
    notices,
  };

  context.logger.info('Daily standup report generated', {
    notices_count: notices.length,
  });

  return {
    output,
    actual_cost: spec.cost_model.fixed_cost,
    metadata: {
      report_type: 'daily_standup',
    },
  };
};
