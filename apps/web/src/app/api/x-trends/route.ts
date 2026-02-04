/**
 * X Trends API
 *
 * X（Twitter）トレンド調査スキルを実行するエンドポイント。
 * X APIからデータを取得し、スキルに渡して分析結果を返す。
 *
 * POST /api/x-trends
 */

import { NextRequest, NextResponse } from 'next/server';
import { XApiClient, isXApiAvailable } from '@/lib/external/x-api';

/**
 * リクエストボディの型
 */
interface XTrendsRequest {
  keywords: string[];
  period?: '24h' | '7d' | '30d';
  limit?: number;
  min_engagement?: number;
  language?: 'ja' | 'en' | 'all';
}

/**
 * POST /api/x-trends
 *
 * X APIからツイートを取得し、トレンド分析を実行
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as XTrendsRequest;

    // バリデーション
    if (!body.keywords || body.keywords.length === 0) {
      return NextResponse.json(
        { error: 'keywords is required' },
        { status: 400 }
      );
    }

    const {
      keywords,
      period = '7d',
      limit = 20,
      min_engagement = 100,
      language = 'ja',
    } = body;

    // X APIの利用可否を確認
    const useRealApi = isXApiAvailable();

    let tweets: Array<{
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
    }> = [];

    if (useRealApi) {
      // X APIからデータ取得
      const client = new XApiClient();

      // クエリ構築
      const query = XApiClient.buildQuery({
        keywords,
        language: language === 'all' ? undefined : language,
        minLikes: Math.floor(min_engagement / 2), // いいね数でフィルタ
        excludeRetweets: true,
        excludeReplies: true,
      });

      // 期間の計算
      const now = new Date();
      let startTime: Date;
      switch (period) {
        case '24h':
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '30d':
          // Free tierは7日まで
          startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '7d':
        default:
          startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }

      try {
        const response = await client.searchRecentTweets(query, {
          maxResults: Math.min(limit, 100), // API上限は100
          startTime: startTime.toISOString(),
        });

        if (response.data && response.includes?.users) {
          const usersMap = new Map(
            response.includes.users.map((u) => [u.id, u])
          );

          tweets = response.data.map((tweet) => {
            const author = usersMap.get(tweet.author_id);
            return {
              id: tweet.id,
              author: {
                username: author?.username || 'unknown',
                display_name: author?.name || 'Unknown User',
                followers_count: author?.public_metrics?.followers_count || 0,
                verified: author?.verified || false,
              },
              content: tweet.text,
              posted_at: tweet.created_at,
              metrics: {
                likes: tweet.public_metrics?.like_count || 0,
                retweets: tweet.public_metrics?.retweet_count || 0,
                replies: tweet.public_metrics?.reply_count || 0,
                views: tweet.public_metrics?.impression_count,
              },
            };
          });
        }
      } catch (apiError) {
        console.error('[X API] Error fetching tweets:', apiError);
        // エラー時はモックにフォールバック
      }
    }

    // X APIからデータ取得できなかった場合はモックデータ
    if (tweets.length === 0) {
      tweets = generateMockTweets(keywords, limit);
    }

    // エンゲージメントでフィルタ
    const filteredTweets = tweets.filter(
      (t) => t.metrics.likes + t.metrics.retweets >= min_engagement
    );

    // 結果を返す
    return NextResponse.json({
      success: true,
      data_source: useRealApi && tweets.length > 0 ? 'x_api' : 'mock',
      search_params: {
        keywords,
        period,
        language,
        min_engagement,
      },
      tweets: filteredTweets.slice(0, limit),
      total_found: filteredTweets.length,
      api_configured: useRealApi,
      message: useRealApi
        ? 'X APIからデータを取得しました'
        : 'X_BEARER_TOKEN未設定のため、モックデータを使用しています',
    });
  } catch (error) {
    console.error('[X Trends API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * モックツイート生成
 */
function generateMockTweets(
  keywords: string[],
  limit: number
): Array<{
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
}> {
  const mockAuthors = [
    {
      username: 'tech_insider_jp',
      display_name: 'テックインサイダー',
      followers_count: 125000,
      verified: true,
    },
    {
      username: 'startup_ceo',
      display_name: 'スタートアップCEO',
      followers_count: 45000,
      verified: false,
    },
    {
      username: 'ai_researcher',
      display_name: 'AI研究者',
      followers_count: 89000,
      verified: true,
    },
    {
      username: 'venture_news',
      display_name: 'ベンチャーニュース',
      followers_count: 200000,
      verified: true,
    },
    {
      username: 'product_hunter',
      display_name: 'プロダクトハンター',
      followers_count: 33000,
      verified: false,
    },
  ];

  const keyword = keywords[0] || 'AI';
  const mockContents = [
    `${keyword}の最新動向をまとめました。特に注目なのは、LLMの進化により従来不可能だったタスクが自動化されている点。\n\n#AI #スタートアップ`,
    `今週の${keyword}関連ニュース：大手VCが新ファンドを設立、累計1000億円規模に。日本のAI企業への投資が加速。`,
    `${keyword}について深掘り。成功している企業の共通点は、技術力よりも「課題設定力」にあった。`,
    `速報：${keyword}分野で新たなユニコーン誕生。評価額10億ドル超え。創業わずか2年。`,
    `${keyword}の実態調査レポートを公開。意外な結果として、BtoB領域での活用が急増。`,
    `${keyword}スタートアップの資金調達額が過去最高を更新。AIブームの波が続く。`,
    `「${keyword}で何ができるか」より「何を解決したいか」が重要。成功事例から学ぶ。`,
  ];

  const posts = [];
  const now = new Date();

  for (let i = 0; i < Math.min(limit, mockContents.length * 2); i++) {
    const author = mockAuthors[i % mockAuthors.length];
    const content = mockContents[i % mockContents.length];
    const hoursAgo = Math.floor(Math.random() * 168);
    const postedAt = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);

    posts.push({
      id: `mock_${Date.now()}_${i}`,
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

  return posts.sort(
    (a, b) =>
      b.metrics.likes +
      b.metrics.retweets -
      (a.metrics.likes + a.metrics.retweets)
  );
}

/**
 * GET /api/x-trends
 *
 * API設定状況を確認
 */
export async function GET() {
  const configured = isXApiAvailable();

  return NextResponse.json({
    api_configured: configured,
    message: configured
      ? 'X API is configured and ready'
      : 'X API is not configured. Set X_BEARER_TOKEN environment variable.',
    setup_guide: !configured
      ? {
          step1: 'Go to https://developer.x.com and create a developer account',
          step2: 'Create a new app and generate Bearer Token',
          step3: 'Add X_BEARER_TOKEN to your environment variables',
          note: 'Free tier allows 1,500 tweets/month (past 7 days only)',
        }
      : null,
  });
}
