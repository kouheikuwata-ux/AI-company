/**
 * Usage Pattern Skill
 *
 * ユーザーの利用パターンを分析し、傾向とインサイトを抽出する。
 * CS Manager が週次で使用し、利用状況を把握する。
 *
 * 設計原則：
 * - 匿名化されたデータのみ使用
 * - 行動推奨は行わない（人間が判断）
 * - トレンドの可視化に注力
 */

import { z } from 'zod';
import type { SkillSpec, SkillHandler, SkillContext } from '@ai-company-os/skill-spec';
import { ResponsibilityLevel } from '@ai-company-os/skill-spec';

/**
 * 入力スキーマ
 */
export const inputSchema = z.object({
  /** 分析期間 */
  period: z.enum(['daily', 'weekly', 'monthly']).default('weekly'),

  /** トレンド分析を含めるか */
  include_trends: z.boolean().default(true),

  /** セグメント分析を含めるか */
  include_segments: z.boolean().default(false),

  /** 機能別分析を含めるか */
  include_feature_breakdown: z.boolean().default(true),
});

export type Input = z.infer<typeof inputSchema>;

/**
 * 機能利用統計スキーマ
 */
const featureUsageSchema = z.object({
  feature_key: z.string(),
  feature_name: z.string(),
  usage_count: z.number(),
  unique_users: z.number(),
  avg_session_duration_sec: z.number(),
  trend: z.enum(['increasing', 'stable', 'decreasing']),
  trend_percent: z.number(),
});

/**
 * ユーザーセグメントスキーマ
 */
const segmentSchema = z.object({
  segment_name: z.string(),
  user_count: z.number(),
  percentage: z.number(),
  avg_sessions_per_user: z.number(),
  top_features: z.array(z.string()),
});

/**
 * 出力スキーマ
 */
export const outputSchema = z.object({
  /** 分析日時 */
  analyzed_at: z.string(),

  /** 分析期間 */
  period: z.string(),
  period_start: z.string(),
  period_end: z.string(),

  /** 全体サマリー */
  summary: z.object({
    total_active_users: z.number(),
    total_sessions: z.number(),
    avg_sessions_per_user: z.number(),
    avg_session_duration_sec: z.number(),
    retention_rate: z.number(),
  }),

  /** 機能別利用統計 */
  features: z.array(featureUsageSchema),

  /** トレンド（include_trendsがtrueの場合） */
  trends: z.object({
    user_growth_percent: z.number(),
    engagement_change_percent: z.number(),
    emerging_features: z.array(z.string()),
    declining_features: z.array(z.string()),
  }).optional(),

  /** セグメント分析（include_segmentsがtrueの場合） */
  segments: z.array(segmentSchema).optional(),

  /** 利用時間帯分布 */
  time_distribution: z.object({
    peak_hours: z.array(z.number()),
    peak_days: z.array(z.string()),
  }),
});

export type Output = z.infer<typeof outputSchema>;

/**
 * スキル仕様
 */
export const spec: SkillSpec = {
  key: 'cs.usage-pattern',
  version: '1.0.0',
  name: '利用パターン分析',
  description:
    'ユーザーの利用パターンを分析し、機能別利用状況とトレンドを把握します。行動推奨は行いません。',
  category: 'cs',
  tags: ['cs', 'usage', 'analytics', 'customer-success'],

  input: {
    schema: inputSchema._def as unknown as Record<string, unknown>,
    examples: [
      {
        period: 'weekly',
        include_trends: true,
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
    estimated_tokens_output: 400,
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
 * 注入された利用データの型
 */
interface InjectedUsageData {
  summary: {
    active_users: number;
    total_sessions: number;
    avg_session_duration_sec: number;
    retention_rate: number;
  };
  features: Array<{
    feature_key: string;
    feature_name: string;
    usage_count: number;
    unique_users: number;
    avg_session_duration_sec: number;
    previous_usage_count?: number;
  }>;
  time_distribution?: {
    by_hour: Record<string, number>;
    by_day: Record<string, number>;
  };
  period: {
    start: string;
    end: string;
  };
}

/**
 * トレンド判定
 */
function getTrend(
  current: number,
  previous: number | undefined
): { trend: 'increasing' | 'stable' | 'decreasing'; percent: number } {
  if (previous === undefined || previous === 0) {
    return { trend: 'stable', percent: 0 };
  }
  const changePercent = ((current - previous) / previous) * 100;
  if (changePercent > 10) return { trend: 'increasing', percent: changePercent };
  if (changePercent < -10) return { trend: 'decreasing', percent: changePercent };
  return { trend: 'stable', percent: changePercent };
}

/**
 * スキル実行ハンドラー
 */
export const execute: SkillHandler = async (
  input: Record<string, unknown>,
  context: SkillContext
) => {
  const parsed = inputSchema.parse(input);

  context.logger.info('Analyzing usage patterns', {
    period: parsed.period,
    include_trends: parsed.include_trends,
  });

  const now = new Date();
  let periodStart: Date;

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

  // 注入された利用データを取得
  const injectedData = input._usage as InjectedUsageData | undefined;

  if (injectedData?.period) {
    periodStart = new Date(injectedData.period.start);
  }

  // 機能別統計を処理
  const features: Array<{
    feature_key: string;
    feature_name: string;
    usage_count: number;
    unique_users: number;
    avg_session_duration_sec: number;
    trend: 'increasing' | 'stable' | 'decreasing';
    trend_percent: number;
  }> = [];

  const emergingFeatures: string[] = [];
  const decliningFeatures: string[] = [];

  if (injectedData?.features) {
    for (const feature of injectedData.features) {
      const { trend, percent } = getTrend(feature.usage_count, feature.previous_usage_count);

      features.push({
        feature_key: feature.feature_key,
        feature_name: feature.feature_name,
        usage_count: feature.usage_count,
        unique_users: feature.unique_users,
        avg_session_duration_sec: feature.avg_session_duration_sec,
        trend,
        trend_percent: Math.round(percent * 10) / 10,
      });

      if (trend === 'increasing' && percent > 20) {
        emergingFeatures.push(feature.feature_name);
      } else if (trend === 'decreasing' && percent < -20) {
        decliningFeatures.push(feature.feature_name);
      }
    }
  }

  // 使用量順にソート
  features.sort((a, b) => b.usage_count - a.usage_count);

  // ピーク時間帯を計算
  let peakHours: number[] = [10, 14, 16]; // デフォルト
  let peakDays: string[] = ['火曜日', '水曜日'];

  if (injectedData?.time_distribution) {
    const byHour = injectedData.time_distribution.by_hour;
    const byDay = injectedData.time_distribution.by_day;

    peakHours = Object.entries(byHour)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour]) => parseInt(hour, 10));

    peakDays = Object.entries(byDay)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([day]) => day);
  }

  const summary = injectedData?.summary || {
    active_users: 0,
    total_sessions: 0,
    avg_session_duration_sec: 0,
    retention_rate: 0,
  };

  const output: Output = {
    analyzed_at: now.toISOString(),
    period: parsed.period,
    period_start: periodStart.toISOString(),
    period_end: now.toISOString(),
    summary: {
      total_active_users: summary.active_users,
      total_sessions: summary.total_sessions,
      avg_sessions_per_user:
        summary.active_users > 0 ? summary.total_sessions / summary.active_users : 0,
      avg_session_duration_sec: summary.avg_session_duration_sec,
      retention_rate: summary.retention_rate,
    },
    features,
    time_distribution: {
      peak_hours: peakHours,
      peak_days: peakDays,
    },
  };

  // トレンド分析（オプション）
  if (parsed.include_trends) {
    output.trends = {
      user_growth_percent: 0,
      engagement_change_percent: 0,
      emerging_features: emergingFeatures,
      declining_features: decliningFeatures,
    };
  }

  // セグメント分析（オプション）
  if (parsed.include_segments) {
    output.segments = [];
  }

  context.logger.info('Usage pattern analysis completed', {
    total_users: summary.active_users,
    features_analyzed: features.length,
  });

  return {
    output,
    actual_cost: spec.cost_model.fixed_cost,
    metadata: {
      skill_type: 'usage_pattern',
      period: parsed.period,
    },
  };
};
