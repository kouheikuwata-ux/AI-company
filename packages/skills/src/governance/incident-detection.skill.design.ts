/**
 * ============================================================
 * Incident Detection Skill - 設計ドキュメント
 * ============================================================
 *
 * ステータス: Phase B（設計のみ、実装は将来）
 *
 * ## 概要
 * 異常実行・コスト急増・失敗連鎖を検知するスキル。
 * 検知のみを行い、自動対応は行わない。
 *
 * ## 設計原則
 * 1. 検知は通知のみ - 自動停止・自動対応は禁止
 * 2. 誤検知を許容 - 検知漏れより誤検知を優先
 * 3. 人間が判断 - インシデント認定は責任者が行う
 * 4. 監査可能 - 全検知ロジックとパラメータを記録
 *
 * ## 検知対象
 *
 * ### 1. 異常実行パターン
 * - 短時間での大量実行（DoS的パターン）
 * - 通常と異なる時間帯での実行
 * - 新規executor_idからの突然の大量リクエスト
 * - 失敗後の即時リトライ連鎖
 *
 * ### 2. コスト異常
 * - 日次/時間単位でのコスト急増
 * - 単一スキルでの異常コスト
 * - 予算消費速度の急激な変化
 *
 * ### 3. 失敗連鎖
 * - 同一スキルの連続失敗
 * - 同一executor_idの連続失敗
 * - カスケード失敗（親子実行の連鎖失敗）
 *
 * ### 4. 整合性異常
 * - 状態遷移の異常（不正な遷移パターン）
 * - 予約と消費の不整合
 * - 監査ログと実行ログの乖離
 *
 * ## 入力スキーマ（予定）
 * ```typescript
 * {
 *   // 検知期間
 *   detection_window_minutes: number;  // デフォルト: 60
 *
 *   // 検知タイプ選択
 *   detection_types: Array<
 *     'execution_anomaly' |
 *     'cost_anomaly' |
 *     'failure_cascade' |
 *     'consistency_anomaly'
 *   >;
 *
 *   // 閾値設定（オプション）
 *   thresholds: {
 *     execution_spike_multiplier: number;     // 通常の何倍で異常とするか
 *     cost_spike_multiplier: number;
 *     consecutive_failures_threshold: number;
 *   };
 *
 *   // 除外設定
 *   exclusions: {
 *     skill_keys: string[];        // 検知対象外のスキル
 *     executor_ids: string[];      // 検知対象外の実行者
 *   };
 * }
 * ```
 *
 * ## 出力スキーマ（予定）
 * ```typescript
 * {
 *   detection_metadata: {
 *     generated_at: string;
 *     detection_window: { start: string; end: string; };
 *     tenant_id: string;
 *   };
 *
 *   // 検知されたインシデント候補
 *   detected_incidents: Array<{
 *     id: string;
 *     type: string;
 *     severity: 'low' | 'medium' | 'high' | 'critical';
 *     description: string;
 *     evidence: Record<string, unknown>;  // 検知根拠
 *     affected_resources: string[];
 *     first_detected_at: string;
 *     // 注意：これはインシデント「候補」であり、
 *     // 正式なインシデント認定は人間が行う
 *   }>;
 *
 *   // 統計情報
 *   detection_stats: {
 *     total_events_analyzed: number;
 *     anomalies_detected: number;
 *     false_positive_indicators: string[];  // 誤検知の可能性を示す要素
 *   };
 *
 *   // 推奨アクションなし（人間が判断）
 *   // recommended_actions は意図的に含めない
 * }
 * ```
 *
 * ## スキル仕様（予定）
 * - key: 'governance.incident-detection'
 * - required_responsibility_level: HUMAN_APPROVED
 * - requires_approval: true
 * - has_external_effect: false
 * - pii_policy.handling: 'REJECT'（PIIは検知対象外）
 *
 * ## 実装時の注意事項
 *
 * ### 検知ロジック
 * 1. 統計的異常検知（Z-score, IQR）を使用
 * 2. 時系列分析（移動平均、トレンド検出）
 * 3. パターンマッチング（既知の異常パターン）
 *
 * ### パフォーマンス
 * 1. インデックス設計を考慮したクエリ
 * 2. サンプリング戦略（全件スキャン回避）
 * 3. インクリメンタル検知（差分処理）
 *
 * ### 通知統合（将来）
 * - Slack / Teams / Email への通知連携
 * - PagerDuty / Opsgenie との統合
 * - ただし、通知先での自動対応は禁止
 *
 * ## 依存関係
 * - execution_state_logs テーブル
 * - audit_logs テーブル
 * - budget_transactions テーブル
 * - skill_executions テーブル
 *
 * ## セキュリティ考慮事項
 * 1. 検知ロジック自体が攻撃対象になりうる
 *    → 閾値やパラメータは監査ログに記録
 * 2. 大量の誤検知によるアラート疲れ
 *    → 重複排除と集約を実装
 * 3. 検知回避の試み
 *    → 複数の検知手法を組み合わせ
 *
 * ============================================================
 */

// このファイルは設計ドキュメントであり、実装は含まれません。
// 実装時は incident-detection.skill.ts として作成してください。

export const DESIGN_STATUS = 'Phase B - Design Only' as const;
export const PLANNED_KEY = 'governance.incident-detection' as const;
export const PLANNED_VERSION = '1.0.0' as const;
