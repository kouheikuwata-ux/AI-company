/**
 * 責任モデル（v3.0）
 *
 * 原則：「AIがやった」は法的に存在しない
 * すべての実行には必ず人間の法的責任者が紐づく
 */

/**
 * 責任レベル定義
 */
export enum ResponsibilityLevel {
  /** Level 0: 人間が直接実行 */
  HUMAN_DIRECT = 0,

  /** Level 1: 人間が承認してAIが実行 */
  HUMAN_APPROVED = 1,

  /** Level 2: AIが実行し人間が事後レビュー（低リスクのみ） */
  AI_WITH_REVIEW = 2,

  /** Level 3: AIが自動実行（内部処理のみ、外部影響なし） */
  AI_INTERNAL_ONLY = 3,
}

/**
 * 操作カテゴリと必要な責任レベル
 */
export const OPERATION_RESPONSIBILITY: Record<string, ResponsibilityLevel> = {
  // 外部影響あり → 必ず人間承認
  'external.email.send': ResponsibilityLevel.HUMAN_APPROVED,
  'external.api.call': ResponsibilityLevel.HUMAN_APPROVED,
  'external.payment.process': ResponsibilityLevel.HUMAN_DIRECT,
  'external.contract.sign': ResponsibilityLevel.HUMAN_DIRECT,

  // データ変更 → 人間承認 or レビュー
  'data.customer.update': ResponsibilityLevel.HUMAN_APPROVED,
  'data.report.generate': ResponsibilityLevel.AI_WITH_REVIEW,

  // 内部処理 → AI自動可
  'internal.analysis.run': ResponsibilityLevel.AI_INTERNAL_ONLY,
  'internal.summary.create': ResponsibilityLevel.AI_INTERNAL_ONLY,
};

/**
 * 責任レベルの表示名
 */
export const RESPONSIBILITY_LEVEL_NAMES: Record<ResponsibilityLevel, string> = {
  [ResponsibilityLevel.HUMAN_DIRECT]: '人間直接実行',
  [ResponsibilityLevel.HUMAN_APPROVED]: '人間承認後AI実行',
  [ResponsibilityLevel.AI_WITH_REVIEW]: 'AI実行（事後レビュー）',
  [ResponsibilityLevel.AI_INTERNAL_ONLY]: 'AI自動実行（内部のみ）',
};

/**
 * 責任レベルが操作を許可するかチェック
 */
export function isResponsibilityLevelSufficient(
  requiredLevel: ResponsibilityLevel,
  actualLevel: ResponsibilityLevel
): boolean {
  // レベルが低いほど厳格（0が最も厳格）
  return actualLevel <= requiredLevel;
}
