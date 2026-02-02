/**
 * Request Intake Skill
 *
 * 新規スキルリクエストの受付と自動トリアージを行う。
 * HR Manager が日次で使用し、受け付けたリクエストを優先度付けする。
 *
 * 設計原則：
 * - リクエストの分類と優先度付けのみ
 * - 承認/却下の判断は人間が行う
 * - 監査可能な形式で記録
 */

import { z } from 'zod';
import type { SkillSpec, SkillHandler, SkillContext } from '@ai-company-os/skill-spec';
import { ResponsibilityLevel } from '@ai-company-os/skill-spec';

/**
 * 入力スキーマ
 */
export const inputSchema = z.object({
  /** 自動トリアージを行うか */
  auto_triage: z.boolean().default(true),

  /** 取得期間（時間） */
  period_hours: z.number().default(24),

  /** フィルタ条件 */
  filters: z
    .object({
      status: z.array(z.enum(['pending', 'triaged', 'approved', 'rejected'])).optional(),
      priority: z.array(z.enum(['critical', 'high', 'medium', 'low'])).optional(),
      requester_id: z.string().optional(),
    })
    .optional(),
});

export type Input = z.infer<typeof inputSchema>;

/**
 * リクエスト情報
 */
const requestSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  requester_id: z.string(),
  requester_name: z.string(),
  skill_category: z.string().optional(),
  business_justification: z.string().optional(),
  estimated_usage_frequency: z.enum(['daily', 'weekly', 'monthly', 'occasional']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  status: z.enum(['pending', 'triaged', 'approved', 'rejected']),
  created_at: z.string(),
  triage_notes: z.string().optional(),
});

/**
 * 出力スキーマ
 */
export const outputSchema = z.object({
  /** 処理日時 */
  processed_at: z.string(),

  /** 期間 */
  period_hours: z.number(),

  /** サマリー */
  summary: z.object({
    total_requests: z.number(),
    by_status: z.record(z.string(), z.number()),
    by_priority: z.record(z.string(), z.number()),
    new_requests: z.number(),
    triaged_count: z.number(),
  }),

  /** リクエスト一覧 */
  requests: z.array(requestSchema),

  /** トリアージ結果（auto_triage=trueの場合） */
  triage_results: z.array(
    z.object({
      request_id: z.string(),
      suggested_priority: z.enum(['critical', 'high', 'medium', 'low']),
      suggested_category: z.string(),
      reason: z.string(),
    })
  ),
});

export type Output = z.infer<typeof outputSchema>;

/**
 * スキル仕様
 */
export const spec: SkillSpec = {
  key: 'ai-affairs.request-intake',
  version: '1.0.0',
  name: 'スキルリクエスト受付',
  description:
    '新規スキルリクエストの受付と自動トリアージを行います。分類と優先度付けのみを行い、承認判断は人間が行います。',
  category: 'ai-affairs',
  tags: ['ai-affairs', 'request', 'triage', 'skill-management'],

  input: {
    schema: inputSchema._def as unknown as Record<string, unknown>,
    examples: [
      {
        auto_triage: true,
        period_hours: 24,
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
    timeout_seconds: 60,
    max_retries: 2,
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
 * 優先度判定ルール
 */
function suggestPriority(request: {
  title: string;
  description: string;
  estimated_usage_frequency?: string;
}): { priority: 'critical' | 'high' | 'medium' | 'low'; reason: string } {
  const text = `${request.title} ${request.description}`.toLowerCase();

  // Critical: セキュリティ、法務関連
  if (text.includes('security') || text.includes('セキュリティ') ||
      text.includes('legal') || text.includes('法務') ||
      text.includes('compliance') || text.includes('コンプライアンス')) {
    return { priority: 'critical', reason: 'セキュリティ/法務関連のため緊急度高' };
  }

  // High: 日次使用、重要業務
  if (request.estimated_usage_frequency === 'daily' ||
      text.includes('urgent') || text.includes('緊急') ||
      text.includes('revenue') || text.includes('売上')) {
    return { priority: 'high', reason: '日次使用または重要業務に影響' };
  }

  // Medium: 週次使用
  if (request.estimated_usage_frequency === 'weekly') {
    return { priority: 'medium', reason: '週次使用のため中程度の優先度' };
  }

  // Low: その他
  return { priority: 'low', reason: '定期的な使用頻度ではないため通常優先度' };
}

/**
 * カテゴリ判定ルール
 */
function suggestCategory(request: { title: string; description: string }): string {
  const text = `${request.title} ${request.description}`.toLowerCase();

  if (text.includes('report') || text.includes('レポート') || text.includes('分析')) {
    return 'analytics';
  }
  if (text.includes('notification') || text.includes('通知') || text.includes('alert')) {
    return 'operations';
  }
  if (text.includes('budget') || text.includes('予算') || text.includes('cost')) {
    return 'governance';
  }
  if (text.includes('health') || text.includes('monitor') || text.includes('監視')) {
    return 'engineering';
  }
  if (text.includes('customer') || text.includes('顧客') || text.includes('user')) {
    return 'cs';
  }

  return 'general';
}

/**
 * スキル実行ハンドラー
 */
export const execute: SkillHandler = async (
  input: Record<string, unknown>,
  context: SkillContext
) => {
  const parsed = inputSchema.parse(input);

  context.logger.info('Processing skill requests', {
    auto_triage: parsed.auto_triage,
    period_hours: parsed.period_hours,
  });

  // プレースホルダーデータ（実際はDBから取得）
  // 実運用時はRunner経由でDB集計結果を受け取る
  const requests: Array<{
    id: string;
    title: string;
    description: string;
    requester_id: string;
    requester_name: string;
    skill_category?: string;
    business_justification?: string;
    estimated_usage_frequency?: 'daily' | 'weekly' | 'monthly' | 'occasional';
    priority: 'critical' | 'high' | 'medium' | 'low';
    status: 'pending' | 'triaged' | 'approved' | 'rejected';
    created_at: string;
    triage_notes?: string;
  }> = [];

  // トリアージ結果
  const triageResults: Array<{
    request_id: string;
    suggested_priority: 'critical' | 'high' | 'medium' | 'low';
    suggested_category: string;
    reason: string;
  }> = [];

  if (parsed.auto_triage) {
    for (const request of requests.filter(r => r.status === 'pending')) {
      const { priority, reason } = suggestPriority(request);
      const category = suggestCategory(request);

      triageResults.push({
        request_id: request.id,
        suggested_priority: priority,
        suggested_category: category,
        reason,
      });
    }
  }

  // サマリー集計
  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};

  for (const request of requests) {
    byStatus[request.status] = (byStatus[request.status] || 0) + 1;
    byPriority[request.priority] = (byPriority[request.priority] || 0) + 1;
  }

  const output: Output = {
    processed_at: new Date().toISOString(),
    period_hours: parsed.period_hours,
    summary: {
      total_requests: requests.length,
      by_status: byStatus,
      by_priority: byPriority,
      new_requests: requests.filter(r => r.status === 'pending').length,
      triaged_count: triageResults.length,
    },
    requests,
    triage_results: triageResults,
  };

  context.logger.info('Request intake completed', {
    total_requests: requests.length,
    triaged_count: triageResults.length,
  });

  return {
    output,
    actual_cost: spec.cost_model.fixed_cost,
    metadata: {
      skill_type: 'request_intake',
    },
  };
};
