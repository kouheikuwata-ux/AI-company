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
    requires_approval: false, // チェックのみなので承認不要（実際の廃止は別スキル）
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
 * 注入されたメトリクスの型
 */
interface InjectedMetrics {
  skills: Array<{
    skill_key: string;
    skill_name: string;
    version: string;
    usage: {
      total_executions: number;
      unique_users: number;
      unique_agents: number;
    };
    performance: {
      success_rate: number;
      avg_latency_ms: number;
      p95_latency_ms: number;
      error_count: number;
      timeout_count: number;
    };
    cost: {
      total_cost: number;
      avg_cost_per_execution: number;
    };
    last_used_at: string | null;
    trend: 'improving' | 'stable' | 'degrading';
  }>;
  summary: {
    total_executions: number;
    success_rate: number;
    total_cost: number;
    avg_latency_ms: number;
  };
  period: {
    start: string;
    end: string;
    days: number;
  };
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

  // 注入されたメトリクスを取得
  const injectedMetrics = input._metrics as InjectedMetrics | undefined;
  const now = new Date();

  // 廃止候補を生成
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

  let totalSkillsChecked = 0;
  let healthySkillsCount = 0;
  const warnings: Array<{
    type: 'dependency_chain' | 'critical_agent_impact' | 'recent_activity';
    message: string;
    affected_skills: string[];
  }> = [];

  // 実データから廃止候補を検出
  if (injectedMetrics?.skills) {
    totalSkillsChecked = injectedMetrics.skills.length;

    for (const skill of injectedMetrics.skills) {
      const reasons: Array<{
        type: 'inactivity' | 'high_error_rate' | 'low_cost_efficiency' | 'superseded' | 'deprecated_dependency';
        description: string;
        metric_value?: number;
        threshold_value?: number;
      }> = [];

      // 最終使用日からの日数を計算
      const daysSinceLastUse = skill.last_used_at
        ? Math.floor((now.getTime() - new Date(skill.last_used_at).getTime()) / (24 * 60 * 60 * 1000))
        : parsed.inactivity_threshold_days + 1;

      // 非アクティブチェック
      if (daysSinceLastUse > parsed.inactivity_threshold_days) {
        reasons.push({
          type: 'inactivity',
          description: `${daysSinceLastUse}日間使用されていません`,
          metric_value: daysSinceLastUse,
          threshold_value: parsed.inactivity_threshold_days,
        });
      }

      // エラー率チェック
      const errorRate = 1 - skill.performance.success_rate;
      if (errorRate > parsed.error_rate_threshold && skill.usage.total_executions >= parsed.min_executions_for_evaluation) {
        reasons.push({
          type: 'high_error_rate',
          description: `エラー率が${(errorRate * 100).toFixed(1)}%と高い水準です`,
          metric_value: errorRate,
          threshold_value: parsed.error_rate_threshold,
        });
      }

      // コスト効率チェック
      const avgCostBenchmark = 0.01;
      const costEfficiency = Math.min(1, avgCostBenchmark / (skill.cost.avg_cost_per_execution || avgCostBenchmark));
      if (costEfficiency < parsed.cost_efficiency_threshold && skill.usage.total_executions >= parsed.min_executions_for_evaluation) {
        reasons.push({
          type: 'low_cost_efficiency',
          description: `コスト効率が${(costEfficiency * 100).toFixed(1)}%と低い水準です`,
          metric_value: costEfficiency,
          threshold_value: parsed.cost_efficiency_threshold,
        });
      }

      // 問題がある場合は候補に追加
      if (reasons.length > 0) {
        const dependencies = {
          depends_on: [],
          dependents: [],
          agent_users: skill.usage.unique_agents > 0 ? [`${skill.usage.unique_agents} agents`] : [],
        };

        const impactLevel = calculateImpactLevel(dependencies);
        const recommendedAction = determineRecommendation(reasons, impactLevel, daysSinceLastUse);

        candidates.push({
          skill_key: skill.skill_key,
          skill_name: skill.skill_name,
          version: skill.version,
          reasons,
          last_used_at: skill.last_used_at || undefined,
          stats: {
            total_executions: skill.usage.total_executions,
            success_rate: skill.performance.success_rate,
            avg_cost: skill.cost.avg_cost_per_execution,
            days_since_last_use: daysSinceLastUse,
          },
          dependencies,
          impact_level: impactLevel,
          recommended_action: recommendedAction,
        });
      } else {
        healthySkillsCount++;
      }
    }
  }

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
    checked_at: now.toISOString(),
    evaluation_period_days: parsed.inactivity_threshold_days,
    summary: {
      total_skills_checked: totalSkillsChecked,
      deprecation_candidates: candidates.length,
      by_reason: byReason,
      by_impact: byImpact,
      by_recommendation: byRecommendation,
    },
    candidates,
    healthy_skills_count: healthySkillsCount,
    warnings,
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
