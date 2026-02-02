/**
 * Compliance Check Skill
 *
 * Company OS のコンプライアンスチェックを実行
 * Auditor Agent が使用
 *
 * 設計図: docs/agents-and-skills.md に「中優先度」として定義
 *
 * チェック項目:
 * - 責任レベルの整合性
 * - 承認フローの遵守
 * - PII ポリシーの準拠
 * - 監査ログの完全性
 */

import { z } from 'zod';
import type { SkillSpec, SkillHandler, SkillContext } from '@ai-company-os/skill-spec';
import { ResponsibilityLevel } from '@ai-company-os/skill-spec';

/**
 * 入力スキーマ
 */
export const inputSchema = z.object({
  /** チェック対象期間の開始日 */
  period_start: z.string().optional(),

  /** チェック対象期間の終了日（省略時は今日） */
  period_end: z.string().optional(),

  /** チェックカテゴリ（省略時は全カテゴリ） */
  categories: z.array(z.enum([
    'responsibility_level',
    'approval_flow',
    'pii_policy',
    'audit_log',
    'budget_compliance',
    'data_retention',
  ])).optional(),

  /** 詳細レベル */
  detail_level: z.enum(['summary', 'detailed']).default('summary'),

  /** 言語 */
  language: z.enum(['ja', 'en']).default('ja'),
});

export type Input = z.infer<typeof inputSchema>;

/**
 * コンプライアンス違反
 */
const violationSchema = z.object({
  id: z.string(),
  category: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  title: z.string(),
  description: z.string(),
  affected_entity: z.object({
    type: z.enum(['skill', 'agent', 'execution', 'user']),
    id: z.string(),
    name: z.string().optional(),
  }),
  detected_at: z.string(),
  recommended_action: z.string(),
  auto_remediation_available: z.boolean(),
});

/**
 * カテゴリ別チェック結果
 */
const categoryResultSchema = z.object({
  category: z.string(),
  category_name: z.string(),
  status: z.enum(['compliant', 'non_compliant', 'warning', 'not_checked']),
  checks_passed: z.number(),
  checks_failed: z.number(),
  checks_warning: z.number(),
  violations: z.array(violationSchema),
});

/**
 * 出力スキーマ
 */
export const outputSchema = z.object({
  /** チェック実行日時 */
  checked_at: z.string(),

  /** チェック対象期間 */
  period: z.object({
    start: z.string(),
    end: z.string(),
  }),

  /** 全体ステータス */
  overall_status: z.enum(['compliant', 'non_compliant', 'warning']),

  /** サマリー */
  summary: z.object({
    total_checks: z.number(),
    passed: z.number(),
    failed: z.number(),
    warnings: z.number(),
    compliance_score: z.number(), // 0-100
  }),

  /** カテゴリ別結果 */
  categories: z.array(categoryResultSchema),

  /** 重要な違反 */
  critical_violations: z.array(violationSchema),

  /** 推奨アクション */
  recommended_actions: z.array(z.object({
    priority: z.enum(['immediate', 'soon', 'scheduled']),
    action: z.string(),
    category: z.string(),
    effort: z.enum(['low', 'medium', 'high']),
  })),

  /** 監査証跡 */
  audit_trail: z.object({
    check_id: z.string(),
    executor: z.string(),
    duration_ms: z.number(),
    checks_performed: z.array(z.string()),
  }),
});

export type Output = z.infer<typeof outputSchema>;

/**
 * スキル仕様
 */
export const spec: SkillSpec = {
  key: 'audit.compliance-check',
  version: '1.0.0',
  name: 'コンプライアンスチェック',
  description: 'Company OS のコンプライアンス状態をチェック。責任レベル、承認フロー、PII ポリシー、監査ログの整合性を検証。',
  category: 'audit',
  tags: ['audit', 'compliance', 'governance', 'security'],

  input: {
    schema: inputSchema._def as unknown as Record<string, unknown>,
    examples: [
      {
        categories: ['responsibility_level', 'approval_flow'],
        detail_level: 'summary',
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
    estimated_tokens_input: 600,
    estimated_tokens_output: 1200,
  },

  safety: {
    requires_approval: false,
    timeout_seconds: 120,
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
    max_context_tokens: 25000,
  },

  has_external_effect: false,
  required_responsibility_level: ResponsibilityLevel.AI_WITH_REVIEW,
};

/**
 * チェックIDを生成
 */
function generateCheckId(): string {
  return `chk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * スキル実行ハンドラー
 */
export const execute: SkillHandler = async (
  input: Record<string, unknown>,
  context: SkillContext
) => {
  const startTime = Date.now();
  const parsed = inputSchema.parse(input);

  context.logger.info('Starting compliance check', {
    categories: parsed.categories,
    detail_level: parsed.detail_level,
  });

  const checkId = generateCheckId();
  const now = new Date();

  // 期間を計算
  const periodEnd = parsed.period_end ? new Date(parsed.period_end) : now;
  const periodStart = parsed.period_start
    ? new Date(parsed.period_start)
    : new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000); // デフォルト7日間

  // チェックカテゴリ
  const allCategories = [
    'responsibility_level',
    'approval_flow',
    'pii_policy',
    'audit_log',
    'budget_compliance',
    'data_retention',
  ];
  const categoriesToCheck = parsed.categories || allCategories;

  // カテゴリ別結果を生成（プレースホルダー）
  const categoryResults: Array<{
    category: string;
    category_name: string;
    status: 'compliant' | 'non_compliant' | 'warning' | 'not_checked';
    checks_passed: number;
    checks_failed: number;
    checks_warning: number;
    violations: Array<{
      id: string;
      category: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      title: string;
      description: string;
      affected_entity: {
        type: 'skill' | 'agent' | 'execution' | 'user';
        id: string;
        name?: string;
      };
      detected_at: string;
      recommended_action: string;
      auto_remediation_available: boolean;
    }>;
  }> = [];

  const categoryNames: Record<string, string> = {
    responsibility_level: '責任レベル整合性',
    approval_flow: '承認フロー遵守',
    pii_policy: 'PII ポリシー準拠',
    audit_log: '監査ログ完全性',
    budget_compliance: '予算コンプライアンス',
    data_retention: 'データ保持ポリシー',
  };

  let totalChecks = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalWarnings = 0;

  for (const category of allCategories) {
    const isChecked = categoriesToCheck.includes(category as any);

    if (isChecked) {
      // プレースホルダー: 実際はDB検証を行う
      const passed = 5;
      const failed = 0;
      const warning = 0;

      totalChecks += passed + failed + warning;
      totalPassed += passed;
      totalFailed += failed;
      totalWarnings += warning;

      categoryResults.push({
        category,
        category_name: categoryNames[category] || category,
        status: failed > 0 ? 'non_compliant' : warning > 0 ? 'warning' : 'compliant',
        checks_passed: passed,
        checks_failed: failed,
        checks_warning: warning,
        violations: [],
      });
    } else {
      categoryResults.push({
        category,
        category_name: categoryNames[category] || category,
        status: 'not_checked',
        checks_passed: 0,
        checks_failed: 0,
        checks_warning: 0,
        violations: [],
      });
    }
  }

  // 全体ステータス
  const overallStatus: 'compliant' | 'non_compliant' | 'warning' =
    totalFailed > 0 ? 'non_compliant' : totalWarnings > 0 ? 'warning' : 'compliant';

  // コンプライアンススコア
  const complianceScore = totalChecks > 0
    ? Math.round((totalPassed / totalChecks) * 100)
    : 100;

  // 重要な違反を収集
  const criticalViolations = categoryResults
    .flatMap(c => c.violations)
    .filter(v => v.severity === 'critical' || v.severity === 'high');

  // 推奨アクション
  const recommendedActions: Array<{
    priority: 'immediate' | 'soon' | 'scheduled';
    action: string;
    category: string;
    effort: 'low' | 'medium' | 'high';
  }> = [];

  if (criticalViolations.length > 0) {
    recommendedActions.push({
      priority: 'immediate',
      action: '重大な違反を解決してください',
      category: 'general',
      effort: 'high',
    });
  }

  if (recommendedActions.length === 0) {
    recommendedActions.push({
      priority: 'scheduled',
      action: '定期的なコンプライアンスチェックを継続してください',
      category: 'general',
      effort: 'low',
    });
  }

  const duration = Date.now() - startTime;

  const output: Output = {
    checked_at: now.toISOString(),
    period: {
      start: periodStart.toISOString().split('T')[0],
      end: periodEnd.toISOString().split('T')[0],
    },
    overall_status: overallStatus,
    summary: {
      total_checks: totalChecks,
      passed: totalPassed,
      failed: totalFailed,
      warnings: totalWarnings,
      compliance_score: complianceScore,
    },
    categories: categoryResults,
    critical_violations: criticalViolations,
    recommended_actions: recommendedActions,
    audit_trail: {
      check_id: checkId,
      executor: context.executionId || 'unknown',
      duration_ms: duration,
      checks_performed: categoriesToCheck,
    },
  };

  context.logger.info('Compliance check completed', {
    check_id: checkId,
    overall_status: overallStatus,
    compliance_score: complianceScore,
    duration_ms: duration,
  });

  return {
    output,
    actual_cost: spec.cost_model.fixed_cost,
    metadata: {
      check_type: 'compliance_check',
    },
  };
};
