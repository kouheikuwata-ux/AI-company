/**
 * Skill Deprecation Check Skill
 *
 * 使用されていないスキルや問題のあるスキルを検出し、
 * 廃止候補をリストアップする。
 *
 * 設計原則：
 * - 客観的な基準に基づく検出
 * - 廃止判断は人間が行う
 * - 影響範囲を明確に提示
 */

import { z } from 'zod';
import type { SkillSpec, SkillHandler, SkillContext } from '@ai-company-os/skill-spec';
import { ResponsibilityLevel } from '@ai-company-os/skill-spec';

/**
 * 入力スキーマ
 */
export const inputSchema = z.object({
  /** 非アクティブ判定の閾値（日数） */
  inactivity_threshold_days: z.number().default(90),

  /** エラー率閾値 */
  error_rate_threshold: z.number().min(0).max(1).default(0.3),

  /** コスト効率閾値（0-1, 低いほど非効率） */
  cost_efficiency_threshold: z.number().min(0).max(1).default(0.3),

  /** 最低実行回数（これ以下は評価対象外） */
  min_executions_for_evaluation: z.number().default(10),

  /** 依存関係もチェックするか */
  check_dependencies: z.boolean().default(true),
});

export type Input = z.infer<typeof inputSchema>;

/**
 * 廃止候補スキル
 */
const deprecationCandidateSchema = z.object({
  skill_key: z.string(),
  skill_name: z.string(),
  version: z.string(),

  /** 廃止推奨理由 */
  reasons: z.array(z.object({
    type: z.enum(['inactivity', 'high_error_rate', 'low_cost_efficiency', 'superseded', 'deprecated_dependency']),
    description: z.string(),
    metric_value: z.number().optional(),
    threshold_value: z.number().optional(),
  })),

  /** 最終使用日 */
  last_used_at: z.string().optional(),

  /** 統計 */
  stats: z.object({
    total_executions: z.number(),
    success_rate: z.number(),
    avg_cost: z.number(),
    days_since_last_use: z.number(),
  }),

  /** 依存関係 */
  dependencies: z.object({
    depends_on: z.array(z.string()),
    dependents: z.array(z.string()),
    agent_users: z.array(z.string()),
  }),

  /** 影響度 */
  impact_level: z.enum(['high', 'medium', 'low']),

  /** 推奨アクション */
  recommended_action: z.enum(['deprecate', 'review', 'monitor', 'keep']),
});

/**
 * 出力スキーマ
 */
export const outputSchema = z.object({
  /** チェック日時 */
  checked_at: z.string(),

  /** チェック対象期間 */
  evaluation_period_days: z.number(),

  /** サマリー */
  summary: z.object({
    total_skills_checked: z.number(),
    deprecation_candidates: z.number(),
    by_reason: z.record(z.string(), z.number()),
    by_impact: z.record(z.string(), z.number()),
    by_recommendation: z.record(z.string(), z.number()),
  }),

  /** 廃止候補一覧 */
  candidates: z.array(deprecationCandidateSchema),

  /** 健全なスキル数 */
  healthy_skills_count: z.number(),

  /** 注意事項 */
  warnings: z.array(z.object({
    type: z.enum(['dependency_chain', 'critical_agent_impact', 'recent_activity']),
    message: z.string(),
    affected_skills: z.array(z.string()),
  })),
});

export type Output = z.infer<typeof outputSchema>;

/**
 * スキル仕様
 */
export const spec: SkillSpec = {
  key: 'ai-affairs.skill-deprecation-check',
  version: '1.0.0',
  name: 'スキル廃止チェック',
  description:
    '使用されていないスキルや問題のあるスキルを検出し、廃止候補をリストアップします。廃止判断は人間が行います。',
  category: 'ai-affairs',
  tags: ['ai-affairs', 'deprecation', 'maintenance', 'skill-management'],

  input: {
    schema: inputSchema._def as unknown as Record<string, unknown>,
    examples: [
      {
        inactivity_threshold_days: 90,
        error_rate_threshold: 0.3,
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
    estimated_tokens_input: 400,
    estimated_tokens_output: 1000,
  },

  safety: {
    requires_approval: true, // 廃止候補リストは承認が必要
    timeout_seconds: 120,
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

  has_external_effect: false,
  required_responsibility_level: ResponsibilityLevel.HUMAN_APPROVED,
};

/**
 * 影響度判定
 */
function calculateImpactLevel(dependencies: {
  dependents: string[];
  agent_users: string[];
}): 'high' | 'medium' | 'low' {
  const totalDependents = dependencies.dependents.length + dependencies.agent_users.length;

  if (totalDependents >= 5) return 'high';
  if (totalDependents >= 2) return 'medium';
  return 'low';
}

/**
 * 推奨アクション判定
 */
function determineRecommendation(
  reasons: Array<{ type: string }>,
  impactLevel: 'high' | 'medium' | 'low',
  daysSinceLastUse: number
): 'deprecate' | 'review' | 'monitor' | 'keep' {
  const hasInactivity = reasons.some(r => r.type === 'inactivity');
  const hasHighErrorRate = reasons.some(r => r.type === 'high_error_rate');

  // 長期間未使用で影響が低い
  if (hasInactivity && impactLevel === 'low' && daysSinceLastUse > 180) {
    return 'deprecate';
  }

  // エラー率が高い
  if (hasHighErrorRate) {
    return 'review';
  }

  // 非アクティブだが影響がある
  if (hasInactivity && impactLevel !== 'low') {
    return 'monitor';
  }

  // 問題があるが軽微
  if (reasons.length > 0) {
    return 'monitor';
  }

  return 'keep';
}

/**
 * スキル実行ハンドラー
 */
export const execute: SkillHandler = async (
  input: Record<string, unknown>,
  context: SkillContext
) => {
  const parsed = inputSchema.parse(input);

  context.logger.info('Checking for skill deprecation candidates', {
    inactivity_threshold_days: parsed.inactivity_threshold_days,
    error_rate_threshold: parsed.error_rate_threshold,
  });

  // プレースホルダーデータ（実際はDBから取得）
  const candidates: Array<{
    skill_key: string;
    skill_name: string;
    version: string;
    reasons: Array<{
      type: 'inactivity' | 'high_error_rate' | 'low_cost_efficiency' | 'superseded' | 'deprecated_dependency';
      description: string;
      metric_value?: number;
      threshold_value?: number;
    }>;
    last_used_at?: string;
    stats: {
      total_executions: number;
      success_rate: number;
      avg_cost: number;
      days_since_last_use: number;
    };
    dependencies: {
      depends_on: string[];
      dependents: string[];
      agent_users: string[];
    };
    impact_level: 'high' | 'medium' | 'low';
    recommended_action: 'deprecate' | 'review' | 'monitor' | 'keep';
  }> = [];

  // 集計
  const byReason: Record<string, number> = {};
  const byImpact: Record<string, number> = { high: 0, medium: 0, low: 0 };
  const byRecommendation: Record<string, number> = { deprecate: 0, review: 0, monitor: 0, keep: 0 };

  for (const candidate of candidates) {
    for (const reason of candidate.reasons) {
      byReason[reason.type] = (byReason[reason.type] || 0) + 1;
    }
    byImpact[candidate.impact_level]++;
    byRecommendation[candidate.recommended_action]++;
  }

  const output: Output = {
    checked_at: new Date().toISOString(),
    evaluation_period_days: parsed.inactivity_threshold_days,
    summary: {
      total_skills_checked: 0, // 実際はDBから取得
      deprecation_candidates: candidates.length,
      by_reason: byReason,
      by_impact: byImpact,
      by_recommendation: byRecommendation,
    },
    candidates,
    healthy_skills_count: 0, // 実際はDBから取得
    warnings: [],
  };

  context.logger.info('Deprecation check completed', {
    candidates_found: candidates.length,
  });

  return {
    output,
    actual_cost: spec.cost_model.fixed_cost,
    metadata: {
      skill_type: 'skill_deprecation_check',
    },
  };
};
