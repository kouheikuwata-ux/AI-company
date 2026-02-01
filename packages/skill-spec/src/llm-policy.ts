import { z } from 'zod';

/**
 * LLM利用規約
 */
export interface LLMPolicy {
  /** トレーニングオプトアウト */
  training_opt_out: boolean;

  /** データ保持期間（0 = 保持しない） */
  data_retention_days: number;

  /** 許可モデル */
  allowed_models: string[];

  /** 最大コンテキストトークン */
  max_context_tokens: number;
}

/**
 * LLMポリシースキーマ
 */
export const LLMPolicySchema = z.object({
  training_opt_out: z.boolean().default(true),
  data_retention_days: z.number().int().min(0).default(0),
  allowed_models: z.array(z.string()).default(['claude-sonnet-4-20250514']),
  max_context_tokens: z.number().int().positive().default(100000),
});

/**
 * デフォルトLLMポリシー
 */
export const DEFAULT_LLM_POLICY: LLMPolicy = {
  training_opt_out: true,
  data_retention_days: 0,
  allowed_models: ['claude-sonnet-4-20250514'],
  max_context_tokens: 100000,
};

/**
 * 許可されたモデルID一覧
 */
export const ALLOWED_MODEL_IDS = [
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
] as const;

/**
 * Anthropic API呼び出し時のヘッダー取得
 */
export function getLLMHeaders(policy: LLMPolicy): Record<string, string> {
  const headers: Record<string, string> = {};

  // トレーニングオプトアウト（将来のAnthropicヘッダー対応用）
  if (policy.training_opt_out) {
    // 現在Anthropicには明示的なオプトアウトヘッダーはないが、
    // APIの利用規約でデフォルトでオプトアウトされている
  }

  return headers;
}

/**
 * モデルIDが許可されているかチェック
 */
export function isModelAllowed(modelId: string, allowedModels: string[]): boolean {
  return allowedModels.includes(modelId);
}
