/**
 * Satisfaction Report Skill
 *
 * ユーザー満足度をモニタリングし、レポートを生成する。
 * CS Manager が月次で使用し、全体的な顧客満足度を把握する。
 *
 * 設計原則：
 * - 客観的な指標に基づく報告
 * - 推奨は人間が判断（include_recommendationsはfalse）
 * - NPS/CSAT等の標準的な指標を使用
 */

import { z } from 'zod';
import type { SkillSpec, SkillHandler, SkillContext } from '@ai-company-os/skill-spec';
import { ResponsibilityLevel } from '@ai-company-os/skill-spec';

/**
 * 入力スキーマ
 */
export const inputSchema = z.object({
  /** NPSを含めるか */
  include_nps: z.boolean().default(true),

  /** CSATを含めるか */
  include_csat: z.boolean().default(true),

  /** 推奨を含めるか（通常はfalse - 人間が判断） */
  include_recommendations: z.boolean().default(false),

  /** 比較期間を含めるか */
  include_comparison: z.boolean().default(true),
});

export type Input = z.infer<typeof inputSchema>;

/**
 * NPSスコアスキーマ
 */
const npsSchema = z.object({
  score: z.number().min(-100).max(100),
  total_responses: z.number(),
  promoters: z.number(),
  passives: z.number(),
  detractors: z.number(),
  promoter_percent: z.number(),
  passive_percent: z.number(),
  detractor_percent: z.number(),
});

/**
 * CSATスコアスキーマ
 */
const csatSchema = z.object({
  score: z.number().min(0).max(100),
  total_responses: z.number(),
  very_satisfied: z.number(),
  satisfied: z.number(),
  neutral: z.number(),
  dissatisfied: z.number(),
  very_dissatisfied: z.number(),
});

/**
 * 出力スキーマ
 */
export const outputSchema = z.object({
  /** レポート日時 */
  reported_at: z.string(),

  /** レポート期間 */
  period: z.string(),
  period_start: z.string(),
  period_end: z.string(),

  /** NPSデータ（include_npsがtrueの場合） */
  nps: npsSchema.optional(),

  /** CSATデータ（include_csatがtrueの場合） */
  csat: csatSchema.optional(),

  /** 全体サマリー */
  summary: z.object({
    overall_health: z.enum(['excellent', 'good', 'needs_attention', 'critical']),
    total_survey_responses: z.number(),
    response_rate: z.number(),
    key_metrics: z.array(z.object({
      name: z.string(),
      value: z.number(),
      unit: z.string(),
      trend: z.enum(['up', 'stable', 'down']),
    })),
  }),

  /** 前期比較（include_comparisonがtrueの場合） */
  comparison: z.object({
    previous_period: z.string(),
    nps_change: z.number().optional(),
    csat_change: z.number().optional(),
    response_rate_change: z.number(),
  }).optional(),

  /** カテゴリ別満足度 */
  by_category: z.array(z.object({
    category: z.string(),
    satisfaction_score: z.number(),
    response_count: z.number(),
    change_from_previous: z.number().optional(),
  })),

  /** データ品質 */
  data_quality: z.object({
    confidence_level: z.enum(['high', 'medium', 'low']),
    sample_size_adequate: z.boolean(),
    notes: z.array(z.string()),
  }),
});

export type Output = z.infer<typeof outputSchema>;

/**
 * スキル仕様
 */
export const spec: SkillSpec = {
  key: 'cs.satisfaction-report',
  version: '1.0.0',
  name: '満足度レポート',
  description:
    'ユーザー満足度をNPS/CSAT等の指標でモニタリングし、月次レポートを生成します。推奨は行いません。',
  category: 'cs',
  tags: ['cs', 'satisfaction', 'nps', 'csat', 'customer-success'],

  input: {
    schema: inputSchema._def as unknown as Record<string, unknown>,
    examples: [
      {
        include_nps: true,
        include_recommendations: false,
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
    estimated_tokens_input: 150,
    estimated_tokens_output: 450,
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
    max_context_tokens: 15000,
  },

  has_external_effect: false,
  required_responsibility_level: ResponsibilityLevel.AI_WITH_REVIEW,
};

/**
 * 注入された満足度データの型
 */
interface InjectedSatisfactionData {
  nps?: {
    promoters: number;
    passives: number;
    detractors: number;
  };
  csat?: {
    very_satisfied: number;
    satisfied: number;
    neutral: number;
    dissatisfied: number;
    very_dissatisfied: number;
  };
  by_category?: Array<{
    category: string;
    satisfaction_score: number;
    response_count: number;
  }>;
  previous?: {
    nps_score?: number;
    csat_score?: number;
    response_rate?: number;
  };
  period: {
    start: string;
    end: string;
  };
}

/**
 * 健康度判定
 */
function determineHealth(npsScore?: number, csatScore?: number): 'excellent' | 'good' | 'needs_attention' | 'critical' {
  const avgScore = (npsScore !== undefined && csatScore !== undefined)
    ? (((npsScore + 100) / 2) + csatScore) / 2
    : npsScore !== undefined
      ? (npsScore + 100) / 2
      : csatScore !== undefined
        ? csatScore
        : 50;

  if (avgScore >= 80) return 'excellent';
  if (avgScore >= 60) return 'good';
  if (avgScore >= 40) return 'needs_attention';
  return 'critical';
}

/**
 * スキル実行ハンドラー
 */
export const execute: SkillHandler = async (
  input: Record<string, unknown>,
  context: SkillContext
) => {
  const parsed = inputSchema.parse(input);

  context.logger.info('Generating satisfaction report', {
    include_nps: parsed.include_nps,
    include_csat: parsed.include_csat,
  });

  const now = new Date();
  // 月次レポートなので30日前から
  const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 注入された満足度データを取得
  const injectedData = input._satisfaction as InjectedSatisfactionData | undefined;

  let npsData: {
    score: number;
    total_responses: number;
    promoters: number;
    passives: number;
    detractors: number;
    promoter_percent: number;
    passive_percent: number;
    detractor_percent: number;
  } | undefined;

  let csatData: {
    score: number;
    total_responses: number;
    very_satisfied: number;
    satisfied: number;
    neutral: number;
    dissatisfied: number;
    very_dissatisfied: number;
  } | undefined;

  // NPS計算
  if (parsed.include_nps && injectedData?.nps) {
    const { promoters, passives, detractors } = injectedData.nps;
    const total = promoters + passives + detractors;
    const npsScore = total > 0 ? ((promoters - detractors) / total) * 100 : 0;

    npsData = {
      score: Math.round(npsScore),
      total_responses: total,
      promoters,
      passives,
      detractors,
      promoter_percent: total > 0 ? Math.round((promoters / total) * 100) : 0,
      passive_percent: total > 0 ? Math.round((passives / total) * 100) : 0,
      detractor_percent: total > 0 ? Math.round((detractors / total) * 100) : 0,
    };
  }

  // CSAT計算
  if (parsed.include_csat && injectedData?.csat) {
    const { very_satisfied, satisfied, neutral, dissatisfied, very_dissatisfied } = injectedData.csat;
    const total = very_satisfied + satisfied + neutral + dissatisfied + very_dissatisfied;
    const csatScore = total > 0 ? ((very_satisfied + satisfied) / total) * 100 : 0;

    csatData = {
      score: Math.round(csatScore),
      total_responses: total,
      very_satisfied,
      satisfied,
      neutral,
      dissatisfied,
      very_dissatisfied,
    };
  }

  const totalResponses = (npsData?.total_responses || 0) + (csatData?.total_responses || 0);

  // カテゴリ別データ
  const byCategory = injectedData?.by_category || [];

  // 健康度判定
  const health = determineHealth(npsData?.score, csatData?.score);

  // キーメトリクス
  const keyMetrics: Array<{
    name: string;
    value: number;
    unit: string;
    trend: 'up' | 'stable' | 'down';
  }> = [];

  if (npsData) {
    keyMetrics.push({
      name: 'NPS',
      value: npsData.score,
      unit: 'points',
      trend: 'stable',
    });
  }

  if (csatData) {
    keyMetrics.push({
      name: 'CSAT',
      value: csatData.score,
      unit: '%',
      trend: 'stable',
    });
  }

  const output: Output = {
    reported_at: now.toISOString(),
    period: 'monthly',
    period_start: injectedData?.period?.start || periodStart.toISOString(),
    period_end: injectedData?.period?.end || now.toISOString(),
    summary: {
      overall_health: health,
      total_survey_responses: totalResponses,
      response_rate: 0, // 実データから計算
      key_metrics: keyMetrics,
    },
    by_category: byCategory.map(cat => ({
      category: cat.category,
      satisfaction_score: cat.satisfaction_score,
      response_count: cat.response_count,
    })),
    data_quality: {
      confidence_level: totalResponses >= 100 ? 'high' : totalResponses >= 30 ? 'medium' : 'low',
      sample_size_adequate: totalResponses >= 30,
      notes: totalResponses < 30 ? ['サンプルサイズが統計的に不十分です'] : [],
    },
  };

  // NPS/CSATデータを追加
  if (npsData) {
    output.nps = npsData;
  }
  if (csatData) {
    output.csat = csatData;
  }

  // 比較データ（オプション）
  if (parsed.include_comparison && injectedData?.previous) {
    output.comparison = {
      previous_period: 'previous_month',
      nps_change: npsData && injectedData.previous.nps_score !== undefined
        ? npsData.score - injectedData.previous.nps_score
        : undefined,
      csat_change: csatData && injectedData.previous.csat_score !== undefined
        ? csatData.score - injectedData.previous.csat_score
        : undefined,
      response_rate_change: 0,
    };
  }

  context.logger.info('Satisfaction report generated', {
    health,
    total_responses: totalResponses,
  });

  return {
    output,
    actual_cost: spec.cost_model.fixed_cost,
    metadata: {
      skill_type: 'satisfaction_report',
      include_nps: parsed.include_nps,
      include_csat: parsed.include_csat,
    },
  };
};
