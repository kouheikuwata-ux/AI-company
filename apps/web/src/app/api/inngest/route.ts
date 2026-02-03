import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { handleSkillExecute } from '@/lib/inngest/functions/skill-execute';
import { agentScheduledTaskFunctions } from '@/lib/inngest/functions/agent-scheduled-tasks';
import { agentEventTriggerFunctions } from '@/lib/inngest/functions/agent-event-triggers';
import { notificationFunctions } from '@/lib/inngest/functions/notifications';

/**
 * Inngest サーブエンドポイント
 *
 * 登録されるファンクション:
 * - handleSkillExecute: スキル実行ハンドラー（イベント駆動）
 * - agentScheduledTaskFunctions: エージェント定期タスク（cron駆動）
 *   - CEO: 週次サマリー、日次例外チェック
 *   - CFO: 日次予算、週次コスト、月次レビュー
 *   - COO: 朝会、午後ステータス、週次レビュー
 *   - CTO: ヘルスチェック、パフォーマンス、セキュリティ、改善提案
 *   - HR Manager: リクエストレビュー、スキル評価、改善提案、廃止チェック
 *   - CS Manager: フィードバック、利用レポート、満足度
 * - agentEventTriggerFunctions: イベント駆動タスク
 *   - agentEventHandler: 24種のイベントを適切なエージェントにルーティング
 *   - escalationNotificationHandler: エスカレーション処理
 *   - agentMessageHandler: エージェント間メッセージ処理
 * - notificationFunctions: 通知ハンドラー
 *   - handleEscalationNotification: 人間へのエスカレーション通知
 *   - handleExecutionFailureNotification: 実行失敗通知
 *   - handleApprovalNeededNotification: 承認要求通知
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    handleSkillExecute,
    ...agentScheduledTaskFunctions,
    ...agentEventTriggerFunctions,
    ...notificationFunctions,
  ],
});
