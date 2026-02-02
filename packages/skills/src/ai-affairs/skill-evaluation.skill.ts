/**
 * Skill Evaluation Skill
 *
 * 既存スキルのパフォーマンス評価を行う。
 * HR Manager が週次で使用し、スキルの健全性を確認する。
 *
 * 設計原則：
 * - 客観的な指標に基づく評価
 * - 改善提案は事実ベース
 * - 廃止判断は人間が行う
 */

import { z } from 'zod';
import type { SkillSpec, SkillHandler, SkillContext } from '@ai-company-os/skill-spec';
import { ResponsibilityLevel } from '@ai-company-os/skill-spec';

/**
 * 入力スキーマ
 */
export const inputSchema = z.object({
  /** 評価タイプ */
  evaluation_type: z.enum(['performance', 'usage', 'cost', 'full']).default('performance'),

  /** 評価期間 */
  period: z.enum(['daily', 'weekly', 'monthly']).default('weekly'),

  /** 対象スキル（空の場合は全スキル） */
  skill_keys: z.array(z.string()).optional(),

  /** 閾値設定 */
  thresholds: z
    .object({
      min_success_rate: z.number().min(0).max(1).default(0.9),
      max_avg_latency_ms: z.number().default(5000),
      min_usage_count: z.number().default(1),
    })
    .optional(),
});

export type Input = z.infer<typeof inputSchema>;

/**
 * スキル評価結果
 */
const skillEvaluationSchema = z.object({
  skill_key: z.string(),
  skill_name: z.string(),
  version: z.string(),

  // 使用統計
  usage: z.object({
    execution_count: z.number(),
    unique_users: z.number(),
    unique_agents: z.number(),
  }),

  // パフォーマンス
  performance: z.object({
    success_rate: z.number(),
    avg_latency_ms: z.number(),
    p95_latency_ms: z.number(),
    error_count: z.number(),
    timeout_count: z.number(),
  }),

  // コスト
  cost: z.object({
    total_cost: z.number(),
    avg_cost_per_execution: z.number(),
    cost_efficiency_score: z.number(), // 0-1
  }),

  // 評価スコア
  overall_score: z.number(), // 0-100
  grade: z.enum(['A', 'B', 'C', 'D', 'F']),

  // 問題点
  issues: z.array(z.object({
    type: z.enum(['performance', 'usage', 'cost', 'reliability']),
    severity: z.enum(['critical', 'warning', 'info']),
    message: z.string(),
    metric: z.string(),
    current_value: z.number(),
    threshold_value: z.number(),
  })),
});

/**
 * 出力スキーマ
 */
export const outputSchema = z.object({
  /** 評価日時 */
  evaluated_at: z.string(),

  /** 評価期間 */
  period: z.string(),
  period_start: z.string(),
  period_end: z.string(),

  /** サマリー */
  summary: z.object({
    total_skills_evaluated: z.number(),
    by_grade: z.record(z.string(), z.number()),
    skills_with_issues: z.number(),
    critical_issues_count: z.number(),
  }),

  /** スキル別評価 */
  evaluations: z.array(skillEvaluationSchema),

  /** 全体的な傾向 */
  trends: z.object({
    improving_skills: z.array(z.string()),
    degrading_skills: z.array(z.string()),
    stable_skills: z.array(z.string()),
  }),
});

export type Output = z.infer<typeof outputSchema>;

/**
 * スキル仕様
 */
export const spec: SkillSpec = {
  key: 'ai-affairs.skill-evaluation',
  version: '1.0.0',
  name: 'スキル評価',
  description:
    '既存スキルのパフォーマンス評価を行います。客観的な指標に基づき、スキルの健全性を確認します。',
  category: 'ai-affairs',
  tags: ['ai-affairs', 'evaluation', 'performance', 'skill-management'],

  input: {
    schema: inputSchema._def as unknown as Record<string, unknown>,
    examples: [
      {
        evaluation_type: 'performance',
        period: 'weekly',
      },
    ],
  },

  output: {
    schema: outputSchema._def as unknown as Record<string, unknown>,
    examples: [],
  },

  cost_model: {
    fixed_cost: 0.008,
    per_token_input: 0.003,
    per_token_output: 0.015,
    estimated_tokens_input: 300,
    estimated_tokens_output: 800,
  },

  safety: {
    requires_approval: false,
    timeout_seconds: 90,
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
    max_context_tokens: 20000,
  },

  has_external_effect: false,
  required_responsibility_level: ResponsibilityLevel.AI_WITH_REVIEW,
};

/**
 * グレード判定
 */
function calculateGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * スコア計算
 */
function calculateScore(
  successRate: number,
  avgLatency: number,
  costEfficiency: number,
  maxLatency: number
): number {
  // 成功率: 40%
  const successScore = successRate * 100 * 0.4;

  // レイテンシ: 30% (低いほど良い)
  const latencyScore = Math.max(0, (1 - avgLatency / maxLatency)) * 100 * 0.3;

  // コスト効率: 30%
  const costScore = costEfficiency * 100 * 0.3;

  return Math.round(successScore + latencyScore + costScore);
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
  const thresholds = parsed.thresholds || {
    min_success_rate: 0.9,
    max_avg_latency_ms: 5000,
    min_usage_count: 1,
  };

  context.logger.info('Evaluating skills', {
    evaluation_type: parsed.evaluation_type,
    period: parsed.period,
  });

  // 注入されたメトリクスを取得
  const injectedMetrics = input._metrics as InjectedMetrics | undefined;
  const now = new Date();
  let periodStart: Date;

  if (injectedMetrics?.period) {
    periodStart = new Date(injectedMetrics.period.start);
  } else {
    switch (parsed.period) {
      case 'daily':
        periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'weekly':
        periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'monthly':
        periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }
  }

  // 実データから評価を生成
  const evaluations: Array<{
    skill_key: string;
    skill_name: string;
    version: string;
    usage: {
      execution_count: number;
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
      cost_efficiency_score: number;
    };
    overall_score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    issues: Array<{
      type: 'performance' | 'usage' | 'cost' | 'reliability';
      severity: 'critical' | 'warning' | 'info';
      message: string;
      metric: string;
      current_value: number;
      threshold_value: number;
    }>;
  }> = [];

  // 実データがある場合は評価を生成
  if (injectedMetrics?.skills) {
    for (const skill of injectedMetrics.skills) {
      // 最低実行回数チェック
      if (skill.usage.total_executions < thresholds.min_usage_count) {
        continue;
      }

      const issues: Array<{
        type: 'performance' | 'usage' | 'cost' | 'reliability';
        severity: 'critical' | 'warning' | 'info';
        message: string;
        metric: string;
        current_value: number;
        threshold_value: number;
      }> = [];

      // 成功率チェック
      if (skill.performance.success_rate < thresholds.min_success_rate) {
        const severity = skill.performance.success_rate < 0.8 ? 'critical' : 'warning';
        issues.push({
          type: 'reliability',
          severity,
          message: `成功率が${(skill.performance.success_rate * 100).toFixed(1)}%と目標値を下回っています`,
          metric: 'success_rate',
          current_value: skill.performance.success_rate,
          threshold_value: thresholds.min_success_rate,
        });
      }

      // レイテンシチェック
      if (skill.performance.avg_latency_ms > thresholds.max_avg_latency_ms) {
        issues.push({
          type: 'performance',
          severity: 'warning',
          message: `平均レイテンシが${skill.performance.avg_latency_ms}msと目標値を超過しています`,
          metric: 'avg_latency_ms',
          current_value: skill.performance.avg_latency_ms,
          threshold_value: thresholds.max_avg_latency_ms,
        });
      }

      // エラー/タイムアウトチェック
      if (skill.performance.error_count > 0 || skill.performance.timeout_count > 0) {
        const totalFailures = skill.performance.error_count + skill.performance.timeout_count;
        const failureRate = totalFailures / skill.usage.total_executions;
        if (failureRate > 0.05) {
          issues.push({
            type: 'reliability',
            severity: failureRate > 0.1 ? 'critical' : 'warning',
            message: `エラー/タイムアウト率が${(failureRate * 100).toFixed(1)}%です`,
            metric: 'failure_rate',
            current_value: failureRate,
            threshold_value: 0.05,
          });
        }
      }

      // トレンドチェック
      if (skill.trend === 'degrading') {
        issues.push({
          type: 'performance',
          severity: 'warning',
          message: 'パフォーマンスが悪化傾向にあります',
          metric: 'trend',
          current_value: -1,
          threshold_value: 0,
        });
      }

      // コスト効率計算（仮の計算：低コストほど効率が良い）
      const avgCostBenchmark = 0.01; // 基準コスト
      const costEfficiency = Math.min(1, avgCostBenchmark / (skill.cost.avg_cost_per_execution || avgCostBenchmark));

      // スコア計算
      const score = calculateScore(
        skill.performance.success_rate,
        skill.performance.avg_latency_ms,
        costEfficiency,
        thresholds.max_avg_latency_ms
      );

      evaluations.push({
        skill_key: skill.skill_key,
        skill_name: skill.skill_name,
        version: skill.version,
        usage: {
          execution_count: skill.usage.total_executions,
          unique_users: skill.usage.unique_users,
          unique_agents: skill.usage.unique_agents,
        },
        performance: skill.performance,
        cost: {
          total_cost: skill.cost.total_cost,
          avg_cost_per_execution: skill.cost.avg_cost_per_execution,
          cost_efficiency_score: costEfficiency,
        },
        overall_score: score,
        grade: calculateGrade(score),
        issues,
      });
    }
  }

  // グレード集計
  const byGrade: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  let skillsWithIssues = 0;
  let criticalIssuesCount = 0;

  for (const evaluation of evaluations) {
    byGrade[evaluation.grade] = (byGrade[evaluation.grade] || 0) + 1;
    if (evaluation.issues.length > 0) {
      skillsWithIssues++;
      criticalIssuesCount += evaluation.issues.filter(i => i.severity === 'critical').length;
    }
  }

  const output: Output = {
    evaluated_at: now.toISOString(),
    period: parsed.period,
    period_start: periodStart.toISOString(),
    period_end: now.toISOString(),
    summary: {
      total_skills_evaluated: evaluations.length,
      by_grade: byGrade,
      skills_with_issues: skillsWithIssues,
      critical_issues_count: criticalIssuesCount,
    },
    evaluations,
    trends: {
      improving_skills: [],
      degrading_skills: [],
      stable_skills: [],
    },
  };

  context.logger.info('Skill evaluation completed', {
    total_skills: evaluations.length,
    skills_with_issues: skillsWithIssues,
  });

  return {
    output,
    actual_cost: spec.cost_model.fixed_cost,
    metadata: {
      skill_type: 'skill_evaluation',
      evaluation_type: parsed.evaluation_type,
    },
  };
};
