/**
 * X (Twitter) API Client
 *
 * X API v2 を使用してツイートを検索・取得する。
 * Free Tier: 1,500件/月、過去7日間のみ
 *
 * 環境変数:
 * - X_BEARER_TOKEN: X Developer Portal で取得した Bearer Token
 */

const X_API_BASE = 'https://api.x.com/2';

/**
 * X API レスポンスの型定義
 */
export interface XUser {
  id: string;
  name: string;
  username: string;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
  };
  verified?: boolean;
}

export interface XTweet {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    impression_count?: number;
  };
  entities?: {
    hashtags?: Array<{ tag: string }>;
    mentions?: Array<{ username: string }>;
    urls?: Array<{ url: string; expanded_url: string }>;
  };
}

export interface XSearchResponse {
  data?: XTweet[];
  includes?: {
    users?: XUser[];
  };
  meta?: {
    newest_id: string;
    oldest_id: string;
    result_count: number;
    next_token?: string;
  };
  errors?: Array<{
    detail: string;
    title: string;
    type: string;
  }>;
}

/**
 * X API クライアント
 */
export class XApiClient {
  private bearerToken: string;

  constructor(bearerToken?: string) {
    this.bearerToken = bearerToken || process.env.X_BEARER_TOKEN || '';
  }

  /**
   * Bearer Token が設定されているか確認
   */
  isConfigured(): boolean {
    return this.bearerToken.length > 0;
  }

  /**
   * API リクエストを送信
   */
  private async request<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error('X API Bearer Token is not configured. Set X_BEARER_TOKEN environment variable.');
    }

    const url = new URL(`${X_API_BASE}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.bearerToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`X API error: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * ツイートを検索（過去7日間）
   *
   * Free Tier では /2/tweets/search/recent のみ利用可能
   *
   * @param query - 検索クエリ（キーワード、ハッシュタグなど）
   * @param options - 検索オプション
   */
  async searchRecentTweets(
    query: string,
    options: {
      maxResults?: number;
      startTime?: string;
      endTime?: string;
      nextToken?: string;
    } = {}
  ): Promise<XSearchResponse> {
    const params: Record<string, string> = {
      query,
      'tweet.fields': 'created_at,public_metrics,entities,author_id',
      'user.fields': 'name,username,public_metrics,verified',
      'expansions': 'author_id',
      'max_results': String(options.maxResults || 10),
    };

    if (options.startTime) {
      params.start_time = options.startTime;
    }
    if (options.endTime) {
      params.end_time = options.endTime;
    }
    if (options.nextToken) {
      params.next_token = options.nextToken;
    }

    return this.request<XSearchResponse>('/tweets/search/recent', params);
  }

  /**
   * クエリビルダー
   *
   * キーワードと言語からX API用のクエリ文字列を構築
   */
  static buildQuery(options: {
    keywords: string[];
    language?: 'ja' | 'en' | 'all';
    minLikes?: number;
    minRetweets?: number;
    excludeRetweets?: boolean;
    excludeReplies?: boolean;
  }): string {
    const parts: string[] = [];

    // キーワード（OR検索）
    if (options.keywords.length > 0) {
      const keywordQuery = options.keywords
        .map(k => k.includes(' ') ? `"${k}"` : k)
        .join(' OR ');
      parts.push(`(${keywordQuery})`);
    }

    // 言語フィルター
    if (options.language && options.language !== 'all') {
      parts.push(`lang:${options.language}`);
    }

    // エンゲージメントフィルター
    if (options.minLikes && options.minLikes > 0) {
      parts.push(`min_faves:${options.minLikes}`);
    }
    if (options.minRetweets && options.minRetweets > 0) {
      parts.push(`min_retweets:${options.minRetweets}`);
    }

    // リツイート・リプライ除外
    if (options.excludeRetweets) {
      parts.push('-is:retweet');
    }
    if (options.excludeReplies) {
      parts.push('-is:reply');
    }

    return parts.join(' ');
  }
}

/**
 * デフォルトクライアントのエクスポート
 */
export const xApiClient = new XApiClient();

/**
 * X API が利用可能かチェック
 */
export function isXApiAvailable(): boolean {
  return xApiClient.isConfigured();
}
