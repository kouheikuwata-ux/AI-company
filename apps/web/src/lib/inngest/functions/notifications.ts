/**
 * Notification Handlers - 通知イベントハンドラー
 *
 * エスカレーション、実行失敗、承認要求のイベントを処理し、
 * Slack等の外部通知システムに送信する。
 */

import { inngest } from '../client';
import {
  sendEscalationNotification,
  sendFailureNotification,
  sendApprovalNeededNotification,
} from '@/lib/notifications/slack';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * エスカレーション通知ハンドラー
 *
 * escalation.to_human イベントを処理し、Slackに通知を送信
 */
export const handleEscalationNotification = inngest.createFunction(
  {
    id: 'notification-escalation',
    name: 'Notification: Escalation to Human',
  },
  { event: 'escalation.to_human' },
  async ({ event, step }) => {
    const data = event.data;
    const escalation = data.escalation || {};

    console.log('[Notification] Processing escalation to human', {
      from_agent: escalation.from_agent,
      urgency: escalation.urgency,
    });

    // Slack通知を送信
    const sent = await step.run('send-slack-notification', async () => {
      return sendEscalationNotification({
        fromAgent: escalation.from_agent || 'unknown',
        reason: escalation.reason || 'No reason provided',
        urgency: escalation.urgency || 'today',
        context: {
          escalation_id: escalation.id,
          skill_key: data.skill_key,
          execution_id: data.execution_id,
        },
      });
    });

    // 監査ログに記録
    await step.run('log-notification', async () => {
      const supabase = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('audit_logs') as any).insert({
        tenant_id: (data.tenant_id as string) || 'default',
        action: 'notification.escalation.sent',
        actor_type: 'system',
        actor_id: 'notification-service',
        resource_type: 'escalation',
        resource_id: (escalation.id as string) || 'unknown',
        metadata: {
          slack_sent: sent,
          from_agent: escalation.from_agent,
          urgency: escalation.urgency,
        },
      });
    });

    return {
      status: sent ? 'sent' : 'failed',
      channel: 'slack',
      escalation_id: escalation.id,
    };
  }
);

/**
 * 実行失敗通知ハンドラー
 *
 * skill/execute.completed イベントでstate=FAILEDの場合に通知
 */
export const handleExecutionFailureNotification = inngest.createFunction(
  {
    id: 'notification-execution-failure',
    name: 'Notification: Execution Failure',
  },
  { event: 'skill/execute.completed' },
  async ({ event, step }) => {
    const data = event.data;

    // FAILEDでない場合はスキップ
    if (data.state !== 'FAILED') {
      return { status: 'skipped', reason: 'Not a failure' };
    }

    console.log('[Notification] Processing execution failure', {
      execution_id: data.execution_id,
    });

    // 実行詳細を取得
    const executionDetails = await step.run('fetch-execution-details', async () => {
      const supabase = createAdminClient();
      const { data: execution } = await supabase
        .from('skill_executions')
        .select('skill_key, executor_type, executor_id, error_message')
        .eq('id', data.execution_id)
        .single();

      return execution;
    });

    if (!executionDetails) {
      return { status: 'failed', reason: 'Execution not found' };
    }

    const execData = executionDetails as {
      skill_key: string;
      executor_type: string;
      executor_id: string;
      error_message: string | null;
    };

    // Slack通知を送信
    const sent = await step.run('send-slack-notification', async () => {
      return sendFailureNotification({
        executionId: data.execution_id as string,
        skillKey: execData.skill_key,
        errorMessage: execData.error_message || 'Unknown error',
        executorType: execData.executor_type,
        executorId: execData.executor_id,
      });
    });

    return {
      status: sent ? 'sent' : 'failed',
      channel: 'slack',
      execution_id: data.execution_id,
    };
  }
);

/**
 * 承認待ち通知ハンドラー
 *
 * スキルがPENDING_APPROVALステートに移行した際に通知
 */
export const handleApprovalNeededNotification = inngest.createFunction(
  {
    id: 'notification-approval-needed',
    name: 'Notification: Approval Needed',
  },
  { event: 'skill/approval.requested' },
  async ({ event, step }) => {
    const data = event.data;

    console.log('[Notification] Processing approval request', {
      execution_id: data.execution_id,
    });

    // 実行詳細を取得
    const executionDetails = await step.run('fetch-execution-details', async () => {
      const supabase = createAdminClient();
      const { data: execution } = await supabase
        .from('skill_executions')
        .select('skill_key, executor_type, executor_id')
        .eq('id', data.execution_id)
        .single();

      return execution;
    });

    if (!executionDetails) {
      return { status: 'failed', reason: 'Execution not found' };
    }

    const execData = executionDetails as {
      skill_key: string;
      executor_type: string;
      executor_id: string;
    };

    // Slack通知を送信
    const sent = await step.run('send-slack-notification', async () => {
      return sendApprovalNeededNotification({
        executionId: data.execution_id as string,
        skillKey: execData.skill_key,
        executorType: execData.executor_type,
        executorId: execData.executor_id,
        reason: data.reason as string | undefined,
      });
    });

    return {
      status: sent ? 'sent' : 'failed',
      channel: 'slack',
      execution_id: data.execution_id,
    };
  }
);

// Export all notification functions
export const notificationFunctions = [
  handleEscalationNotification,
  handleExecutionFailureNotification,
  handleApprovalNeededNotification,
];
