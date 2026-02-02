/**
 * Feedback Analysis Skill
 *
 * 顧客フィードバックを分析し、傾向とインサイトを抽出する。
 * CS Manager が日次で使用し、フィードバックの傾向を把握する。
 *
 * 設計原則：
 * - 客観的なカテゴリ分類
 * - センチメント分析は補助的に使用
 * - 対応提案は行わない（人間が判断）
 */

import { z } from 'zod';
import type { SkillSpec, SkillHandler, SkillContext } from '@ai-company-os/skill-spec';
import { ResponsibilityLevel } from '@ai-company-os/skill-spec';

/**
 * 入力スキーマ
 */
export const inputSchema = z.object({
  /** 分析期間 */
  period: z.enum(['daily', 'weekly', 'monthly']).default('daily'),

  /** カテゴリ分類を含めるか */
  categorize: z.boolean().default(true),

  /** センチメント分析を含めるか */
  include_sentiment: z.boolean().default(true),

  /** トレンド分析を含めるか */
  include_trends: z.boolean().default(false),

  /** 最小フィードバック数 */
  min_feedback_count: z.number().default(0),
});

export type Input = z.infer<typeof inputSchema>;

/**
 * フィードバックアイテムスキーマ
 */
const feedbackItemSchema = z.object({
  id: z.string(),
  source: z.enum(['app', 'email', 'support', 'survey', 'other']),
  category: z.string(),
  subcategory: z.string().optional(),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  sentiment_score: z.number().min(-1).max(1),
  summary: z.string(),
  key_phrases: z.array(z.string()),
  received_at: z.string(),
});

/**
 * カテゴリサマリースキーマ
 */
const categorySummarySchema = z.object({
  category: z.string(),
  count: z.number(),
  percentage: z.number(),
  avg_sentiment: z.number(),
  top_subcategories: z.array(z.object({
    name: z.string(),
    count: z.number(),
  })),
  sample_feedback_ids: z.array(z.string()),
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
    total_feedback_count: z.number(),
    by_source: z.record(z.string(), z.number()),
    avg_sentiment_score: z.number(),
    sentiment_distribution: z.object({
      positive: z.number(),
      neutral: z.number(),
      negative: z.number(),
    }),
  }),

  /** カテゴリ別サマリー */
  categories: z.array(categorySummarySchema),

  /** 主要なトレンド（include_trendsがtrueの場合） */
  trends: z.object({
    emerging_topics: z.array(z.string()),
    declining_topics: z.array(z.string()),
    volume_change_percent: z.number(),
    sentiment_change: z.number(),
  }).optional(),

  /** 重要なフィードバック（ネガティブ優先） */
  notable_feedback: z.array(feedbackItemSchema),

  /** データ品質情報 */
  data_quality: z.object({
    completeness_score: z.number(),
    data_sources_active: z.array(z.string()),
  }),
});

export type Output = z.infer<typeof outputSchema>;

/**
 * スキル仕様
 */
export const spec: SkillSpec = {
  key: 'cs.feedback-analysis',
  version: '1.0.0',
  name: 'フィードバック分析',
  description:
    '顧客フィードバックを分析し、カテゴリ分類とセンチメント傾向を抽出します。対応提案は行いません。',
  category: 'cs',
  tags: ['cs', 'feedback', 'analysis', 'customer-success'],

  input: {
    schema: inputSchema._def as unknown as Record<string, unknown>,
    examples: [
      {
        period: 'daily',
        categorize: true,
      },
    ],
  },

  output: {
    schema: outputSchema._def as unknown as Record<string, unknown>,
    examples: [],
  },

  cost_model: {
    fixed_cost: 0.006,
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
    input_contains_pii: true,
    output_contains_pii: false,
    pii_fields: ['feedback_text'],
    handling: 'FILTER',
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
 * 注入されたフィードバックデータの型
 */
interface InjectedFeedback {
  feedbacks: Array<{
    id: string;
    source: 'app' | 'email' | 'support' | 'survey' | 'other';
    category: string;
    subcategory?: string;
    text: string;
    sentiment_score: number;
    received_at: string;
  }>;
  period: {
    start: string;
    end: string;
  };
}

/**
 * センチメント判定
 */
function getSentimentLabel(score: number): 'positive' | 'neutral' | 'negative' {
  if (score > 0.3) return 'positive';
  if (score < -0.3) return 'negative';
  return 'neutral';
}

/**
 * キーフレーズ抽出（簡易版）
 */
function extractKeyPhrases(text: string): string[] {
  // 実際の実装ではNLP処理を使用
  const words = text.split(/\s+/).filter(w => w.length > 3);
  return words.slice(0, 5);
}

/**
 * スキル実行ハンドラー
 */
export const execute: SkillHandler = async (
  input: Record<string, unknown>,
  context: SkillContext
) => {
  const parsed = inputSchema.parse(input);

  context.logger.info('Analyzing feedback', {
    period: parsed.period,
    categorize: parsed.categorize,
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

  // 注入されたフィードバックデータを取得
  const injectedData = input._feedback as InjectedFeedback | undefined;

  if (injectedData?.period) {
    periodStart = new Date(injectedData.period.start);
  }

  // フィードバックアイテムを処理
  const feedbackItems: Array<{
    id: string;
    source: 'app' | 'email' | 'support' | 'survey' | 'other';
    category: string;
    subcategory?: string;
    sentiment: 'positive' | 'neutral' | 'negative';
    sentiment_score: number;
    summary: string;
    key_phrases: string[];
    received_at: string;
  }> = [];

  const bySource: Record<string, number> = {};
  const byCategory: Map<string, {
    count: number;
    sentimentSum: number;
    subcategories: Map<string, number>;
    ids: string[];
  }> = new Map();

  let totalSentiment = 0;
  const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };

  if (injectedData?.feedbacks) {
    for (const fb of injectedData.feedbacks) {
      const sentiment = getSentimentLabel(fb.sentiment_score);
      const item = {
        id: fb.id,
        source: fb.source,
        category: fb.category,
        subcategory: fb.subcategory,
        sentiment,
        sentiment_score: fb.sentiment_score,
        summary: fb.text.slice(0, 200),
        key_phrases: extractKeyPhrases(fb.text),
        received_at: fb.received_at,
      };
      feedbackItems.push(item);

      // 集計
      bySource[fb.source] = (bySource[fb.source] || 0) + 1;
      totalSentiment += fb.sentiment_score;
      sentimentCounts[sentiment]++;

      // カテゴリ集計
      if (!byCategory.has(fb.category)) {
        byCategory.set(fb.category, {
          count: 0,
          sentimentSum: 0,
          subcategories: new Map(),
          ids: [],
        });
      }
      const catData = byCategory.get(fb.category)!;
      catData.count++;
      catData.sentimentSum += fb.sentiment_score;
      catData.ids.push(fb.id);
      if (fb.subcategory) {
        catData.subcategories.set(
          fb.subcategory,
          (catData.subcategories.get(fb.subcategory) || 0) + 1
        );
      }
    }
  }

  const totalCount = feedbackItems.length;

  // カテゴリサマリー生成
  const categories: Array<{
    category: string;
    count: number;
    percentage: number;
    avg_sentiment: number;
    top_subcategories: Array<{ name: string; count: number }>;
    sample_feedback_ids: string[];
  }> = [];

  for (const [category, data] of byCategory) {
    const topSubs = Array.from(data.subcategories.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));

    categories.push({
      category,
      count: data.count,
      percentage: totalCount > 0 ? Math.round((data.count / totalCount) * 100) : 0,
      avg_sentiment: data.count > 0 ? data.sentimentSum / data.count : 0,
      top_subcategories: topSubs,
      sample_feedback_ids: data.ids.slice(0, 3),
    });
  }

  // カテゴリを件数順にソート
  categories.sort((a, b) => b.count - a.count);

  // 重要なフィードバック（ネガティブ優先）
  const notableFeedback = feedbackItems
    .filter(f => f.sentiment === 'negative')
    .slice(0, 5);

  const output: Output = {
    analyzed_at: now.toISOString(),
    period: parsed.period,
    period_start: periodStart.toISOString(),
    period_end: now.toISOString(),
    summary: {
      total_feedback_count: totalCount,
      by_source: bySource,
      avg_sentiment_score: totalCount > 0 ? totalSentiment / totalCount : 0,
      sentiment_distribution: sentimentCounts,
    },
    categories,
    notable_feedback: notableFeedback,
    data_quality: {
      completeness_score: totalCount > 0 ? 1.0 : 0,
      data_sources_active: Object.keys(bySource),
    },
  };

  // トレンド分析（オプション）
  if (parsed.include_trends) {
    output.trends = {
      emerging_topics: [],
      declining_topics: [],
      volume_change_percent: 0,
      sentiment_change: 0,
    };
  }

  context.logger.info('Feedback analysis completed', {
    total_feedback: totalCount,
    categories_found: categories.length,
  });

  return {
    output,
    actual_cost: spec.cost_model.fixed_cost,
    metadata: {
      skill_type: 'feedback_analysis',
      period: parsed.period,
    },
  };
};
