import { PII_PATTERNS, isSensitiveKey, type PIIPolicy } from '@ai-company-os/skill-spec';
import { PIIPolicyError } from './errors';

/**
 * PIIガード
 *
 * 原則：「検出」ではなく「設計で禁止」
 * PIIを含むデータはログ・LLMに渡さない
 */
export class PIIGuard {
  /**
   * LLMに渡す前のPIIチェック
   */
  validateForLLM(policy: PIIPolicy, input: unknown): void {
    if (policy.input_contains_pii) {
      switch (policy.handling) {
        case 'REJECT':
          throw new PIIPolicyError(
            'This skill declares PII in input but handling is REJECT. ' +
              'PII cannot be sent to LLM.'
          );
        case 'MASK_BEFORE_LLM':
          // マスク処理は別途行う
          break;
        case 'ALLOW_WITH_CONSENT':
          // 同意がある場合のみ許可（追加の検証が必要）
          break;
      }
    }
  }

  /**
   * PII フィールドをマスク
   */
  maskPIIFields(data: unknown, piiFields: string[]): unknown {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const result = { ...data } as Record<string, unknown>;

    for (const field of piiFields) {
      if (field in result) {
        result[field] = '[MASKED]';
      }
    }

    return result;
  }

  /**
   * ログ記録前のサニタイズ
   */
  sanitizeForLog(data: unknown): unknown {
    return this.deepSanitize(data);
  }

  /**
   * 深い階層のサニタイズ
   */
  private deepSanitize(obj: unknown): unknown {
    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.deepSanitize(item));
    }

    if (obj && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        // センシティブなキー名は値をマスク
        if (isSensitiveKey(key)) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = this.deepSanitize(value);
        }
      }
      return result;
    }

    return obj;
  }

  /**
   * 文字列のサニタイズ
   */
  private sanitizeString(str: string): string {
    let result = str;

    // メールアドレス
    result = result.replace(PII_PATTERNS.email, '[EMAIL]');

    // 日本の電話番号
    result = result.replace(PII_PATTERNS.phone_jp, '[PHONE]');

    // 国際電話番号
    result = result.replace(PII_PATTERNS.phone_intl, '[PHONE]');

    // クレジットカード番号
    result = result.replace(PII_PATTERNS.credit_card, '[CARD]');

    // 郵便番号
    result = result.replace(PII_PATTERNS.postal_code_jp, '[POSTAL]');

    // 長すぎる文字列は切り詰め
    if (result.length > 1000) {
      result = result.slice(0, 1000) + '...[TRUNCATED]';
    }

    return result;
  }

  /**
   * エラーメッセージのサニタイズ
   */
  sanitizeErrorMessage(message: string): string {
    return this.sanitizeString(message).slice(0, 500);
  }
}
