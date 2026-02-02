/**
 * System Health Check Skill
 *
 * システム健全性チェック
 * CTO Agent が使用
 */

import { z } from 'zod';
import type { SkillSpec, SkillHandler, SkillContext } from '@ai-company-os/skill-spec';
import { ResponsibilityLevel } from '@ai-company-os/skill-spec';

/**
 * 入力スキーマ
 */
export const inputSchema = z.object({
  check_depth: z.enum(['quick', 'standard', 'full']).default('standard'),
  include_recommendations: z.boolean().default(true),
});

export type Input = z.infer<typeof inputSchema>;

/**
 * 出力スキーマ
 */
export const outputSchema = z.object({
  timestamp: z.string(),
  overall_status: z.enum(['healthy', 'degraded', 'critical']),
  checks: z.object({
    database: z.object({
      status: z.enum(['ok', 'warning', 'error']),
      latency_ms: z.number(),
    }),
    skills: z.object({
      status: z.enum(['ok', 'warning', 'error']),
      total_active: z.number(),
      avg_success_rate: z.number(),
    }),
    budget: z.object({
      status: z.enum(['ok', 'warning', 'error']),
      utilization_percent: z.number(),
    }),
  }),
  issues: z.array(z.object({
    severity: z.enum(['warning', 'critical']),
    component: z.string(),
    message: z.string(),
  })),
  recommendations: z.array(z.object({
    priority: z.enum(['high', 'medium', 'low']),
    action: z.string(),
    reason: z.string(),
  })),
});

export type Output = z.infer<typeof outputSchema>;

/**
 * スキル仕様
 */
export const spec: SkillSpec = {
  key: 'engineering.system-health',
  version: '1.0.0',
  name: 'システム健全性チェック',
  description: 'AI Company OSの全体的な健全性を診断。問題の早期発見。',
  category: 'engineering',
  tags: ['engineering', 'health', 'monitoring', 'diagnostics'],

  input: {
    schema: inputSchema._def as unknown as Record<string, unknown>,
    examples: [
      {
        check_depth: 'standard',
        include_recommendations: true,
      },
    ],
  },

  output: {
    schema: outputSchema._def as unknown as Record<string, unknown>,
    examples: [],
  },

  cost_model: {
    fixed_cost: 0.005,
    per_token_input: 0,
    per_token_output: 0,
    estimated_tokens_input: 0,
    estimated_tokens_output: 0,
  },

  safety: {
    requires_approval: false,
    timeout_seconds: 30,
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
    allowed_models: [],
    max_context_tokens: 0,
  },

  has_external_effect: false,
  required_responsibility_level: ResponsibilityLevel.AI_INTERNAL_ONLY,
};

/**
 * スキル実行ハンドラー
 */
export const execute: SkillHandler = async (
  input: Record<string, unknown>,
  context: SkillContext
) => {
  const parsed = inputSchema.parse(input);
  const now = new Date();

  context.logger.info('Starting system health check', {
    depth: parsed.check_depth,
  });

  const issues: Output['issues'] = [];
  const recommendations: Output['recommendations'] = [];

  // Database check (simplified)
  const dbLatency = 50; // Placeholder
  const dbStatus = dbLatency < 1000 ? 'ok' : dbLatency < 3000 ? 'warning' : 'error';

  // Skills check (simplified)
  const activeSkills = 4;
  const avgSuccessRate = 0.95;
  const skillsStatus = avgSuccessRate >= 0.9 ? 'ok' : avgSuccessRate >= 0.7 ? 'warning' : 'error';

  if (skillsStatus !== 'ok') {
    issues.push({
      severity: avgSuccessRate < 0.7 ? 'critical' : 'warning',
      component: 'skills',
      message: `平均成功率が${(avgSuccessRate * 100).toFixed(1)}%に低下`,
    });
  }

  // Budget check (simplified)
  const budgetUtilization = 45;
  const budgetStatus = budgetUtilization < 75 ? 'ok' : budgetUtilization < 90 ? 'warning' : 'error';

  if (budgetStatus !== 'ok') {
    issues.push({
      severity: budgetUtilization >= 90 ? 'critical' : 'warning',
      component: 'budget',
      message: `予算使用率が${budgetUtilization}%`,
    });
  }

  // Overall status
  let overallStatus: Output['overall_status'] = 'healthy';
  if (issues.some(i => i.severity === 'critical')) {
    overallStatus = 'critical';
  } else if (issues.length > 0) {
    overallStatus = 'degraded';
  }

  // Recommendations
  if (parsed.include_recommendations) {
    if (skillsStatus !== 'ok') {
      recommendations.push({
        priority: 'high',
        action: '失敗スキルの調査',
        reason: '成功率低下はユーザー体験に影響',
      });
    }
    if (budgetStatus !== 'ok') {
      recommendations.push({
        priority: 'medium',
        action: '予算使用状況の確認',
        reason: '予算超過防止',
      });
    }
  }

  const output: Output = {
    timestamp: now.toISOString(),
    overall_status: overallStatus,
    checks: {
      database: {
        status: dbStatus,
        latency_ms: dbLatency,
      },
      skills: {
        status: skillsStatus,
        total_active: activeSkills,
        avg_success_rate: avgSuccessRate,
      },
      budget: {
        status: budgetStatus,
        utilization_percent: budgetUtilization,
      },
    },
    issues,
    recommendations,
  };

  context.logger.info('System health check completed', {
    overall_status: overallStatus,
    issues_count: issues.length,
  });

  return {
    output,
    actual_cost: spec.cost_model.fixed_cost,
    metadata: {
      check_depth: parsed.check_depth,
    },
  };
};
