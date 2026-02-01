/**
 * ============================================================
 * Workflow Automation Skill - 設計ドキュメント
 * ============================================================
 *
 * ステータス: Phase B（設計のみ、実装は将来）
 *
 * ## 概要
 * 承認付き定型業務自動化スキル。
 * ワークフローの自動実行を行うが、必ず承認フローを経由する。
 *
 * ## 設計原則
 * 1. skipApproval は絶対に不可
 * 2. 各ステップで承認ポイントを設定可能
 * 3. 人間がいつでも介入・中断可能
 * 4. 全ステップの監査ログを記録
 * 5. ロールバック可能な設計
 *
 * ## ワークフロー構成要素
 *
 * ### 1. ステップ（Step）
 * - 単一のスキル実行または条件分岐
 * - 各ステップは独立してロールバック可能
 * - ステップ間のデータ受け渡しは明示的に定義
 *
 * ### 2. 承認ポイント（Approval Point）
 * - ワークフロー開始前（必須）
 * - 各ステップ実行前（オプション、デフォルト有効）
 * - 外部影響を持つステップ前（必須）
 * - コスト閾値超過時（必須）
 *
 * ### 3. 条件分岐（Condition）
 * - 前ステップの出力に基づく分岐
 * - 外部データに基づく分岐
 * - 人間の判断を待つ分岐（HumanDecisionPoint）
 *
 * ### 4. エラーハンドリング
 * - ステップ失敗時の動作定義
 * - リトライ設定
 * - フォールバック処理
 * - 人間へのエスカレーション
 *
 * ## 入力スキーマ（予定）
 * ```typescript
 * {
 *   // ワークフロー定義
 *   workflow: {
 *     id: string;
 *     name: string;
 *     description: string;
 *
 *     // ステップ定義
 *     steps: Array<{
 *       id: string;
 *       name: string;
 *       type: 'skill_execution' | 'condition' | 'human_decision' | 'parallel';
 *
 *       // skill_execution の場合
 *       skill_key?: string;
 *       input_mapping?: Record<string, string>;  // 前ステップからの入力マッピング
 *
 *       // 承認設定
 *       approval: {
 *         required: boolean;  // デフォルト: true
 *         approvers?: string[];  // 指定がなければデフォルト承認者
 *         timeout_hours?: number;
 *       };
 *
 *       // エラーハンドリング
 *       on_error: {
 *         action: 'stop' | 'retry' | 'skip' | 'fallback';
 *         retry_count?: number;
 *         fallback_step_id?: string;
 *       };
 *
 *       // 次のステップ
 *       next_step_id?: string;
 *       conditions?: Array<{
 *         expression: string;  // JSONPath式
 *         next_step_id: string;
 *       }>;
 *     }>;
 *
 *     // ワークフロー全体の設定
 *     settings: {
 *       max_duration_hours: number;
 *       total_budget_limit: number;
 *       allow_parallel: boolean;
 *     };
 *   };
 *
 *   // 初期入力
 *   initial_input: Record<string, unknown>;
 *
 *   // 実行オプション
 *   options: {
 *     dry_run: boolean;  // 実際には実行せず、実行計画のみ返す
 *     step_by_step: boolean;  // 各ステップで一時停止
 *   };
 * }
 * ```
 *
 * ## 出力スキーマ（予定）
 * ```typescript
 * {
 *   workflow_execution: {
 *     id: string;
 *     workflow_id: string;
 *     status: 'pending_approval' | 'running' | 'paused' |
 *             'completed' | 'failed' | 'cancelled';
 *     started_at: string;
 *     completed_at?: string;
 *   };
 *
 *   // 各ステップの状態
 *   step_results: Array<{
 *     step_id: string;
 *     status: 'pending' | 'approved' | 'running' |
 *             'completed' | 'failed' | 'skipped';
 *     approval: {
 *       required: boolean;
 *       approved_by?: string;
 *       approved_at?: string;
 *     };
 *     execution_id?: string;  // スキル実行の場合
 *     output?: Record<string, unknown>;
 *     error?: { code: string; message: string; };
 *   }>;
 *
 *   // 次に必要なアクション
 *   pending_actions: Array<{
 *     type: 'approval_required' | 'human_decision' | 'error_resolution';
 *     step_id: string;
 *     description: string;
 *     options?: string[];  // human_decision の場合の選択肢
 *   }>;
 *
 *   // コスト追跡
 *   cost_tracking: {
 *     total_budgeted: number;
 *     total_consumed: number;
 *     remaining: number;
 *   };
 * }
 * ```
 *
 * ## スキル仕様（予定）
 * - key: 'governance.workflow-automation'
 * - required_responsibility_level: HUMAN_DIRECT（ワークフロー開始は人間が直接行う）
 * - requires_approval: true（ワークフロー開始には必ず承認が必要）
 * - has_external_effect: true（子スキルが外部影響を持つ可能性）
 * - pii_policy: 子スキルの最も厳しいポリシーを継承
 *
 * ## 実装時の注意事項
 *
 * ### 承認フロー
 * 1. ワークフロー開始時の承認は省略不可
 * 2. 各ステップの承認は設定で制御可能だが、
 *    外部影響を持つステップは承認必須
 * 3. コスト閾値を超える場合は追加承認が必要
 *
 * ### 状態管理
 * 1. ワークフロー実行状態はDBに永続化
 * 2. 再開可能（サーバー再起動後も継続可能）
 * 3. 各ステップの状態は独立して管理
 *
 * ### ロールバック
 * 1. 各ステップにロールバック処理を定義可能
 * 2. 失敗時は自動ロールバックせず、人間が判断
 * 3. ロールバック自体も承認が必要
 *
 * ### 並列実行
 * 1. parallel ステップで複数スキルを同時実行可能
 * 2. 各並列ブランチは独立して承認
 * 3. 全ブランチ完了後に次ステップへ
 *
 * ## セキュリティ考慮事項
 * 1. ワークフロー定義の改ざん防止
 *    → 定義はバージョン管理し、変更は承認必須
 * 2. 無限ループの防止
 *    → ステップ実行回数の上限設定
 * 3. 権限エスカレーション防止
 *    → 子スキルは呼び出し元の権限を継承
 *
 * ## 使用例
 *
 * ### 例1: 月次レポート生成ワークフロー
 * 1. データ収集（execution-summary スキル）
 * 2. コスト分析（budget-insight スキル）
 * 3. レポート生成（LLMによる要約）
 * 4. 人間によるレビュー（human_decision）
 * 5. 配信（外部連携、承認必須）
 *
 * ### 例2: インシデント対応ワークフロー
 * 1. インシデント検知確認（human_decision 必須）
 * 2. 影響範囲分析（並列実行）
 * 3. 対応オプション提示（decision-brief スキル）
 * 4. 対応実行（human_decision 必須）
 * 5. 事後レビュー
 *
 * ## 依存関係
 * - SkillRegistry（子スキルの解決）
 * - StateMachine（ワークフロー状態管理）
 * - BudgetService（コスト追跡）
 * - ApprovalService（承認管理）
 *
 * ============================================================
 */

// このファイルは設計ドキュメントであり、実装は含まれません。
// 実装時は workflow-automation.skill.ts として作成してください。

export const DESIGN_STATUS = 'Phase B - Design Only' as const;
export const PLANNED_KEY = 'governance.workflow-automation' as const;
export const PLANNED_VERSION = '1.0.0' as const;

/**
 * 設計メモ：skipApproval が存在しない理由
 *
 * AI Company OS の根本思想として、全ての実行は人間の責任の下で行われる。
 * ワークフロー自動化であっても、以下の理由から承認は省略できない：
 *
 * 1. 法的責任の明確化
 *    - 自動実行であっても、法的責任は human が負う
 *    - 承認は責任の受諾を意味する
 *
 * 2. 監査可能性
 *    - 「誰が」「いつ」「何を」承認したかの記録が必須
 *    - 自動承認は監査証跡を無意味にする
 *
 * 3. 異常時の介入
 *    - 人間がいつでも止められることが重要
 *    - 完全自動化は暴走リスクを持つ
 *
 * 4. 経営責任
 *    - AIの行動は経営者の責任
 *    - 承認なしの自動化は責任の曖昧化を招く
 *
 * したがって、どれほど「便利」であっても、
 * skipApproval オプションは実装しない。
 */
