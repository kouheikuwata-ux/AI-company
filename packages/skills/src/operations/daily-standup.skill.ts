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

  // 注入データを取得（Runner経由でDB集計結果を受け取る）
  const injectedData = input._standup_data as {
    yesterday_summary?: {
      total_executions: number;
      successful: number;
      failed: number;
    };
    pending_approvals?: number;
    running_executions?: number;
    failed_executions?: Array<{
      skill_key: string;
      error_message: string;
    }>;
    system_health?: 'healthy' | 'degraded' | 'critical';
  } | undefined;

  const yesterdaySummary = injectedData?.yesterday_summary || {
    total_executions: 0,
    successful: 0,
    failed: 0,
  };

  const metricsSnapshot = {
    active_skills: 16, // スキル総数
    pending_approvals: injectedData?.pending_approvals || 0,
    system_health: (injectedData?.system_health || 'healthy') as 'healthy' | 'degraded' | 'critical',
  };

  // ブロッカー検出
  const blockers: Array<{ type: string; description: string }> = [];

  if (parsed.include_blockers) {
    // 失敗した実行をブロッカーとして追加
    if (injectedData?.failed_executions) {
      for (const exec of injectedData.failed_executions.slice(0, 3)) {
        blockers.push({
          type: 'execution_failure',
          description: `${exec.skill_key}: ${exec.error_message.slice(0, 100)}`,
        });
      }
    }

    // 承認待ちが多い場合
    if (metricsSnapshot.pending_approvals > 5) {
      blockers.push({
        type: 'approval_backlog',
        description: `${metricsSnapshot.pending_approvals}件の承認待ちがあります`,
      });
    }
  }

  // LLMを使用して要約とお知らせを生成
  const systemPrompt = parsed.language === 'ja'
    ? `あなたは AI Company OS の運用担当者です。
毎日の朝会レポートを生成します。
- 簡潔に要点をまとめてください
- 問題点がある場合は優先度を明確にしてください
- 最大3つのお知らせを生成してください`
    : `You are an AI Company OS operations manager.
Generate a daily standup report.
- Summarize key points concisely
- If there are issues, clarify priorities
- Generate up to 3 notices`;

  const userPrompt = parsed.language === 'ja'
    ? `以下のデータに基づいて朝会レポートのお知らせを生成してください。

【昨日の実行状況】
- 総実行数: ${yesterdaySummary.total_executions}
- 成功: ${yesterdaySummary.successful}
- 失敗: ${yesterdaySummary.failed}

【ブロッカー】
${blockers.length > 0 ? blockers.map(b => `- ${b.type}: ${b.description}`).join('\n') : 'なし'}

【システム状態】
- アクティブスキル: ${metricsSnapshot.active_skills}
- 承認待ち: ${metricsSnapshot.pending_approvals}
- ヘルス: ${metricsSnapshot.system_health}

JSON形式で返してください:
{"notices": ["お知らせ1", "お知らせ2", "お知らせ3"]}`
    : `Generate standup notices based on the following data.

【Yesterday's Executions】
- Total: ${yesterdaySummary.total_executions}
- Success: ${yesterdaySummary.successful}
- Failed: ${yesterdaySummary.failed}

【Blockers】
${blockers.length > 0 ? blockers.map(b => `- ${b.type}: ${b.description}`).join('\n') : 'None'}

【System Status】
- Active Skills: ${metricsSnapshot.active_skills}
- Pending Approvals: ${metricsSnapshot.pending_approvals}
- Health: ${metricsSnapshot.system_health}

Return in JSON format:
{"notices": ["notice1", "notice2", "notice3"]}`;

  let notices: string[] = [];

  try {
    const response = await context.llm.chat({
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: 500,
      temperature: 0.3,
    });

    // JSON抽出
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      notices = parsed.notices || [];
    }
  } catch (error) {
    context.logger.warn('Failed to generate notices via LLM', { error });
    // フォールバック
    if (yesterdaySummary.failed > 0) {
      notices.push(`昨日${yesterdaySummary.failed}件の実行が失敗しました。確認をお願いします。`);
    }
    if (blockers.length > 0) {
      notices.push(`${blockers.length}件のブロッカーがあります。対応をお願いします。`);
    }
    if (notices.length === 0) {
      notices.push('特に問題ありません。本日も順調に稼働しています。');
    }
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
    blockers_count: blockers.length,
  });

  const estimatedInputTokens = spec.cost_model.estimated_tokens_input ?? 200;
  const estimatedOutputTokens = spec.cost_model.estimated_tokens_output ?? 500;

  return {
    output,
    actual_cost: spec.cost_model.fixed_cost +
      (estimatedInputTokens / 1000) * spec.cost_model.per_token_input +
      (estimatedOutputTokens / 1000) * spec.cost_model.per_token_output,
    metadata: {
      report_type: 'daily_standup',
      used_llm: true,
    },
  };
};
