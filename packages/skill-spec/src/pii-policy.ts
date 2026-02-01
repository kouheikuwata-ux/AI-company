import { z } from 'zod';

/**
 * PII制御方針（v3.0）
 *
 * 原則：「検出」ではなく「設計で禁止」
 *
 * 1. スキル定義時にPII有無を宣言
 * 2. PII含むスキルは特別な権限が必要
 * 3. PIIはログ・LLMに絶対に渡さない
 */

/**
 * PII処理方針
 */
export type PIIHandling = 'REJECT' | 'MASK_BEFORE_LLM' | 'ALLOW_WITH_CONSENT';

/**
 * PIIポリシー
 */
export interface PIIPolicy {
  /** 入力にPIIが含まれるか（設計時に宣言） */
  input_contains_pii: boolean;

  /** 出力にPIIが含まれるか */
  output_contains_pii: boolean;

  /** PIIフィールド名（ドキュメント用） */
  pii_fields: string[];

  /** 処理方針 */
  handling: PIIHandling;
}

/**
 * PIIポリシースキーマ
 */
export const PIIPolicySchema = z.object({
  input_contains_pii: z.boolean().default(false),
  output_contains_pii: z.boolean().default(false),
  pii_fields: z.array(z.string()).default([]),
  handling: z.enum(['REJECT', 'MASK_BEFORE_LLM', 'ALLOW_WITH_CONSENT']).default('REJECT'),
});

/**
 * デフォルトPIIポリシー（PII禁止）
 */
export const DEFAULT_PII_POLICY: PIIPolicy = {
  input_contains_pii: false,
  output_contains_pii: false,
  pii_fields: [],
  handling: 'REJECT',
};

/**
 * PIIパターン（検出用、ログサニタイズ用）
 */
export const PII_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone_jp: /\d{2,4}-\d{2,4}-\d{4}/g,
  phone_intl: /\+?\d{1,4}[\s-]?\(?\d{1,4}\)?[\s-]?\d{1,4}[\s-]?\d{1,9}/g,
  credit_card: /\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}/g,
  postal_code_jp: /\d{3}-?\d{4}/g,
};

/**
 * センシティブなキー名パターン
 */
export const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api_?key/i,
  /credit/i,
  /card/i,
  /ssn/i,
  /social/i,
  /phone/i,
  /email/i,
  /address/i,
  /birth/i,
];

/**
 * キー名がセンシティブかどうかチェック
 */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((p) => p.test(key));
}
