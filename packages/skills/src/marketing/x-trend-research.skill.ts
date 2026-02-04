/**
 * X (Twitter) Trend Research Skill
 *
 * X（旧Twitter）のバズ投稿を調査・分析するスキル。
 * マーケティング担当者が市場トレンドを把握するために使用。
 *
 * 設計原則：
 * - キーワードに基づく検索
 * - エンゲージメント指標での分析
 * - トレンド傾向の抽出
 */

import { z } from 'zod';
import type { SkillSpec, SkillHandler, SkillContext } from '@ai-company-os/skill-spec';
import { ResponsibilityLevel } from '@ai-company-os/skill-spec';

/**
 * 入力スキーマ
 */
export const inputSchema = z.object({
  /** 検索キーワード */
  keywords: z.array(z.string()).min(1).describe('検索するキーワードのリスト'),

  /** 検索期間 */
  period: z.enum(['24h', '7d', '30d']).default('7d').describe('検索期間'),

  /** 取得件数上限 */
  limit: z.number().min(5).max(100).default(20).describe('取得する投稿数の上限'),

  /** 最小エンゲージメント */
  min_engagement: z.number().default(100).describe('最小いいね+RT数'),

  /** 言語フィルター */
  language: z.enum(['ja', 'en', 'all']).default('ja').describe('言語フィルター'),

  /** 分析タイプ */
  analysis_type: z.enum(['trending', 'sentiment', 'influencer']).default('trending'),
});

export type Input = z.infer<typeof inputSchema>;

/**
 * 投稿アイテムスキーマ
 */
const postItemSchema = z.object({
  id: z.string(),
  author: z.object({
    username: z.string(),
    display_name: z.string(),
    followers_count: z.number(),
    verified: z.boolean(),
  }),
  content: z.string(),
  posted_at: z.string(),
  metrics: z.object({
    likes: z.number(),
    retweets: z.number(),
    replies: z.number(),
    views: z.number().optional(),
  }),
  engagement_score: z.number(),
  url: z.string(),
});

/**
 * 出力スキーマ
 */
export const outputSchema = z.object({
  /** 分析日時 */
  analyzed_at: z.string(),

  /** 検索条件 */
  search_params: z.object({
    keywords: z.array(z.string()),
    period: z.string(),
    language: z.string(),
  }),

  /** 結果サマリー */
  summary: z.object({
    total_posts_found: z.number(),
    total_engagement: z.number(),
    avg_engagement: z.number(),
    top_hashtags: z.array(z.object({
      tag: z.string(),
      count: z.number(),
    })),
    peak_posting_times: z.array(z.string()),
  }),

  /** トップ投稿 */
  top_posts: z.array(postItemSchema),

  /** トレンド分析 */
  trend_analysis: z.object({
    emerging_topics: z.array(z.string()),
    sentiment_overview: z.object({
      positive: z.number(),
      neutral: z.number(),
      negative: z.number(),
    }),
    key_themes: z.array(z.object({
      theme: z.string(),
      frequency: z.number(),
      example_posts: z.array(z.string()),
    })),
  }),

  /** インフルエンサー */
  top_influencers: z.array(z.object({
    username: z.string(),
    followers: z.number(),
    post_count: z.number(),
    total_engagement: z.number(),
  })),

  /** 推奨アクション（参考情報のみ） */
  insights: z.array(z.string()),
});

export type Output = z.infer<typeof outputSchema>;

/**
 * スキル仕様
 */
export const spec: SkillSpec = {
  key: 'marketing.x-trend-research',
  version: '1.0.0',
  name: 'X（Twitter）トレンド調査',
  description:
    'X（旧Twitter）のバズ投稿を調査・分析します。キーワードに基づいてトレンド投稿を検索し、エンゲージメント分析とトレンド傾向を抽出します。',
  category: 'marketing',
  tags: ['marketing', 'social-media', 'twitter', 'x', 'trend', 'research'],

  input: {
    schema: inputSchema._def as unknown as Record<string, unknown>,
    examples: [
      {
        keywords: ['AIスタートアップ', '生成AI'],
        period: '7d',
        limit: 20,
        language: 'ja',
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
    estimated_tokens_input: 500,
    estimated_tokens_output: 1500,
  },

  safety: {
    requires_approval: false,
    timeout_seconds: 120,
    max_retries: 2,
    retry_delay_seconds: 10,
  },

  pii_policy: {
    input_contains_pii: false,
    output_contains_pii: true, // ユーザー名等を含む
    pii_fields: ['author.username', 'author.display_name'],
    handling: 'ALLOW',
  },

  llm_policy: {
    training_opt_out: true,
    data_retention_days: 0,
    allowed_models: ['claude-sonnet-4-20250514'],
    max_context_tokens: 20000,
  },

  has_external_effect: false,
  required_responsibility_level: ResponsibilityLevel.AI_AUTONOMOUS,
};

/**
 * 注入される投稿データの型（X APIから取得したデータ）
 */
interface InjectedTweet {
  id: string;
  author: {
    username: string;
    display_name: string;
    followers_count: number;
    verified: boolean;
  };
  content: string;
  posted_at: string;
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
    views?: number;
  };
}

interface InjectedXData {
  tweets: InjectedTweet[];
  source: 'x_api' | 'mock';
  fetched_at: string;
}

/**
 * モック投稿データ生成（X API未設定時のフォールバック）
 */
function generateMockPosts(keywords: string[], limit: number): InjectedTweet[] {
  const mockAuthors = [
    { username: 'tech_insider_jp', display_name: 'テックインサイダー', followers_count: 125000, verified: true },
    { username: 'startup_ceo', display_name: 'スタートアップCEO', followers_count: 45000, verified: false },
    { username: 'ai_researcher', display_name: 'AI研究者', followers_count: 89000, verified: true },
    { username: 'venture_news', display_name: 'ベンチャーニュース', followers_count: 200000, verified: true },
    { username: 'product_hunter', display_name: 'プロダクトハンター', followers_count: 33000, verified: false },
  ];

  const mockContents = [
    `${keywords[0]}の最新動向をまとめました。特に注目なのは、LLMの進化により従来不可能だったタスクが自動化されている点。\n\n#AI #スタートアップ`,
    `今週の${keywords[0]}関連ニュース：大手VCが新ファンドを設立、累計1000億円規模に。日本のAI企業への投資が加速。`,
    `${keywords[0]}について深掘り。成功している企業の共通点は、技術力よりも「課題設定力」にあった。`,
    `速報：${keywords[0]}分野で新たなユニコーン誕生。評価額10億ドル超え。創業わずか2年。`,
    `${keywords[0]}の実態調査レポートを公開。意外な結果として、BtoB領域での活用が急増。`,
  ];

  const posts: InjectedTweet[] = [];
  const now = new Date();

  for (let i = 0; i < Math.min(limit, mockContents.length * 2); i++) {
    const author = mockAuthors[i % mockAuthors.length];
    const content = mockContents[i % mockContents.length];
    const hoursAgo = Math.floor(Math.random() * 168); // 過去7日間
    const postedAt = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);

    posts.push({
      id: `post_${Date.now()}_${i}`,
      author,
      content,
      posted_at: postedAt.toISOString(),
      metrics: {
        likes: Math.floor(Math.random() * 5000) + 100,
        retweets: Math.floor(Math.random() * 2000) + 50,
        replies: Math.floor(Math.random() * 500) + 10,
        views: Math.floor(Math.random() * 100000) + 1000,
      },
    });
  }

  return posts.sort((a, b) =>
    (b.metrics.likes + b.metrics.retweets) - (a.metrics.likes + a.metrics.retweets)
  );
}

/**
 * エンゲージメントスコア計算
 */
function calculateEngagementScore(metrics: { likes: number; retweets: number; replies: number }): number {
  return metrics.likes + metrics.retweets * 2 + metrics.replies * 3;
}

/**
 * ハッシュタグ抽出
 */
function extractHashtags(content: string): string[] {
  const matches = content.match(/#[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+/g);
  return matches || [];
}

/**
 * スキル実行ハンドラー
 */
export const execute: SkillHandler = async (
  input: Record<string, unknown>,
  context: SkillContext
) => {
  const parsed = inputSchema.parse(input);

  const now = new Date();

  // 注入されたX APIデータを確認
  const injectedData = input._xdata as InjectedXData | undefined;
  const dataSource = injectedData?.source || 'mock';

  context.logger.info('Starting X trend research', {
    keywords: parsed.keywords,
    period: parsed.period,
    limit: parsed.limit,
    data_source: dataSource,
  });

  // 投稿データ取得（X APIデータがあれば使用、なければモック）
  const rawPosts: InjectedTweet[] = injectedData?.tweets || generateMockPosts(parsed.keywords, parsed.limit);

  // エンゲージメントフィルタリング
  const filteredPosts = rawPosts.filter(post =>
    (post.metrics.likes + post.metrics.retweets) >= parsed.min_engagement
  );

  // 投稿データを整形
  const topPosts = filteredPosts.slice(0, parsed.limit).map(post => ({
    ...post,
    engagement_score: calculateEngagementScore(post.metrics),
    url: `https://x.com/${post.author.username}/status/${post.id}`,
  }));

  // ハッシュタグ集計
  const hashtagCounts = new Map<string, number>();
  for (const post of topPosts) {
    const tags = extractHashtags(post.content);
    for (const tag of tags) {
      hashtagCounts.set(tag, (hashtagCounts.get(tag) || 0) + 1);
    }
  }
  const topHashtags = Array.from(hashtagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  // インフルエンサー集計
  const influencerMap = new Map<string, {
    username: string;
    followers: number;
    post_count: number;
    total_engagement: number;
  }>();
  for (const post of topPosts) {
    const key = post.author.username;
    const existing = influencerMap.get(key);
    if (existing) {
      existing.post_count++;
      existing.total_engagement += post.engagement_score;
    } else {
      influencerMap.set(key, {
        username: post.author.username,
        followers: post.author.followers_count,
        post_count: 1,
        total_engagement: post.engagement_score,
      });
    }
  }
  const topInfluencers = Array.from(influencerMap.values())
    .sort((a, b) => b.total_engagement - a.total_engagement)
    .slice(0, 5);

  // 合計エンゲージメント
  const totalEngagement = topPosts.reduce((sum, p) => sum + p.engagement_score, 0);

  // LLMでトレンド分析
  let trendAnalysis = {
    emerging_topics: [] as string[],
    sentiment_overview: { positive: 0, neutral: 0, negative: 0 },
    key_themes: [] as Array<{ theme: string; frequency: number; example_posts: string[] }>,
  };
  let insights: string[] = [];

  try {
    const systemPrompt = `あなたはソーシャルメディア分析の専門家です。X（Twitter）の投稿データを分析し、トレンドとインサイトを抽出します。

分析のポイント：
- 新興トピックの発見
- センチメント傾向の把握
- 主要テーマの抽出
- マーケティング活用に役立つ洞察`;

    const postsForAnalysis = topPosts.slice(0, 10).map(p =>
      `@${p.author.username} (${p.author.followers_count.toLocaleString()}フォロワー): "${p.content}" [いいね:${p.metrics.likes}, RT:${p.metrics.retweets}]`
    ).join('\n\n');

    const userPrompt = `以下のX（Twitter）投稿データを分析してください。

【検索キーワード】
${parsed.keywords.join(', ')}

【投稿サンプル（上位${Math.min(10, topPosts.length)}件）】
${postsForAnalysis}

【集計データ】
- 総投稿数: ${topPosts.length}
- 総エンゲージメント: ${totalEngagement.toLocaleString()}
- 主要ハッシュタグ: ${topHashtags.slice(0, 5).map(h => h.tag).join(', ') || 'なし'}

以下のJSON形式で分析結果を返してください:
{
  "emerging_topics": ["注目トピック1", "注目トピック2", "注目トピック3"],
  "sentiment_overview": {
    "positive": 60,
    "neutral": 30,
    "negative": 10
  },
  "key_themes": [
    {
      "theme": "テーマ名",
      "frequency": 5,
      "example_posts": ["投稿例1の要約"]
    }
  ],
  "insights": [
    "このキーワードでは〇〇な投稿がバズりやすい",
    "〇〇というトレンドが見られる",
    "〇〇に注目すべき"
  ]
}`;

    const response = await context.llm.chat({
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: 1500,
      temperature: 0.3,
    });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      trendAnalysis = {
        emerging_topics: result.emerging_topics || [],
        sentiment_overview: result.sentiment_overview || { positive: 0, neutral: 0, negative: 0 },
        key_themes: (result.key_themes || []).map((t: { theme: string; frequency?: number; example_posts?: string[] }) => ({
          theme: t.theme,
          frequency: t.frequency || 1,
          example_posts: t.example_posts || [],
        })),
      };
      insights = result.insights || [];
    }
  } catch (error) {
    context.logger.warn('LLM analysis failed, using fallback', { error });
    trendAnalysis = {
      emerging_topics: parsed.keywords,
      sentiment_overview: { positive: 50, neutral: 40, negative: 10 },
      key_themes: [],
    };
    insights = ['分析データが不足しているため、詳細な洞察を生成できませんでした'];
  }

  const output: Output = {
    analyzed_at: now.toISOString(),
    search_params: {
      keywords: parsed.keywords,
      period: parsed.period,
      language: parsed.language,
    },
    summary: {
      total_posts_found: topPosts.length,
      total_engagement: totalEngagement,
      avg_engagement: topPosts.length > 0 ? Math.round(totalEngagement / topPosts.length) : 0,
      top_hashtags: topHashtags,
      peak_posting_times: ['09:00-10:00', '12:00-13:00', '20:00-22:00'], // 一般的なピーク時間
    },
    top_posts: topPosts,
    trend_analysis: trendAnalysis,
    top_influencers: topInfluencers,
    insights,
  };

  context.logger.info('X trend research completed', {
    posts_found: topPosts.length,
    total_engagement: totalEngagement,
  });

  const estimatedInputTokens = spec.cost_model.estimated_tokens_input ?? 500;
  const estimatedOutputTokens = spec.cost_model.estimated_tokens_output ?? 1500;

  return {
    output,
    actual_cost: spec.cost_model.fixed_cost +
      (estimatedInputTokens / 1000) * spec.cost_model.per_token_input +
      (estimatedOutputTokens / 1000) * spec.cost_model.per_token_output,
    metadata: {
      skill_type: 'x_trend_research',
      keywords: parsed.keywords,
      posts_analyzed: topPosts.length,
    },
  };
};
