/**
 * Slack Notification Service
 *
 * Slack Webhook APIを使用して通知を送信する。
 * 主にエスカレーション、実行失敗、承認要求を処理。
 */

interface SlackNotification {
  type: 'escalation' | 'failure' | 'approval_needed';
  title: string;
  message: string;
  urgency: 'immediate' | 'today' | 'this_week';
  metadata?: Record<string, unknown>;
}

interface SlackBlockElement {
  type: string;
  text?: string | {
    type: string;
    text: string;
    emoji?: boolean;
  };
  style?: string;
  action_id?: string;
}

interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: SlackBlockElement[];
  fields?: Array<{
    type: string;
    text: string;
  }>;
}

/**
 * Urgencyに基づく絵文字を取得
 */
function getUrgencyEmoji(urgency: SlackNotification['urgency']): string {
  switch (urgency) {
    case 'immediate':
      return ':rotating_light:';
    case 'today':
      return ':warning:';
    case 'this_week':
      return ':information_source:';
    default:
      return ':bell:';
  }
}

/**
 * 通知タイプに基づく色を取得
 */
function getNotificationColor(type: SlackNotification['type']): string {
  switch (type) {
    case 'escalation':
      return '#ff6b6b'; // Red
    case 'failure':
      return '#ffa502'; // Orange
    case 'approval_needed':
      return '#3742fa'; // Blue
    default:
      return '#2ed573'; // Green
  }
}

/**
 * 通知タイプに基づくラベルを取得
 */
function getNotificationLabel(type: SlackNotification['type']): string {
  switch (type) {
    case 'escalation':
      return 'エスカレーション';
    case 'failure':
      return '実行失敗';
    case 'approval_needed':
      return '承認要求';
    default:
      return '通知';
  }
}

/**
 * Slack Webhook APIに通知を送信
 */
export async function sendSlackNotification(
  notification: SlackNotification
): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn('[Slack] SLACK_WEBHOOK_URL is not configured');
    return false;
  }

  const emoji = getUrgencyEmoji(notification.urgency);
  const color = getNotificationColor(notification.type);
  const label = getNotificationLabel(notification.type);

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} ${notification.title}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: notification.message,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `*タイプ:* ${label} | *緊急度:* ${notification.urgency}`,
        },
      ],
    },
  ];

  // メタデータがある場合は追加
  if (notification.metadata && Object.keys(notification.metadata).length > 0) {
    const fields = Object.entries(notification.metadata)
      .slice(0, 10) // 最大10フィールド
      .map(([key, value]) => ({
        type: 'mrkdwn' as const,
        text: `*${key}:* ${String(value)}`,
      }));

    if (fields.length > 0) {
      blocks.push({
        type: 'section',
        fields,
      });
    }
  }

  // アクションボタン（承認要求の場合）
  if (notification.type === 'approval_needed') {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'ダッシュボードで確認',
            emoji: true,
          },
          action_id: 'view_dashboard',
        },
      ],
    });
  }

  const payload = {
    attachments: [
      {
        color,
        blocks,
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Slack] Failed to send notification:', {
        status: response.status,
        error: errorText,
      });
      return false;
    }

    console.log('[Slack] Notification sent successfully', {
      type: notification.type,
      title: notification.title,
    });

    return true;
  } catch (error) {
    console.error('[Slack] Error sending notification:', error);
    return false;
  }
}

/**
 * エスカレーション通知を送信
 */
export async function sendEscalationNotification(params: {
  fromAgent: string;
  reason: string;
  urgency: 'immediate' | 'today' | 'this_week';
  context?: Record<string, unknown>;
}): Promise<boolean> {
  return sendSlackNotification({
    type: 'escalation',
    title: `人間への判断要求: ${params.fromAgent}`,
    message: `*理由:* ${params.reason}\n\n人間の判断が必要なタスクが発生しました。ダッシュボードで詳細を確認してください。`,
    urgency: params.urgency,
    metadata: {
      from_agent: params.fromAgent,
      ...params.context,
    },
  });
}

/**
 * 実行失敗通知を送信
 */
export async function sendFailureNotification(params: {
  executionId: string;
  skillKey: string;
  errorMessage: string;
  executorType: string;
  executorId: string;
}): Promise<boolean> {
  return sendSlackNotification({
    type: 'failure',
    title: `スキル実行失敗: ${params.skillKey}`,
    message: `*エラー:* ${params.errorMessage}\n\n実行ID: \`${params.executionId}\``,
    urgency: 'today',
    metadata: {
      execution_id: params.executionId,
      skill_key: params.skillKey,
      executor: `${params.executorType}:${params.executorId}`,
    },
  });
}

/**
 * 承認要求通知を送信
 */
export async function sendApprovalNeededNotification(params: {
  executionId: string;
  skillKey: string;
  executorType: string;
  executorId: string;
  reason?: string;
}): Promise<boolean> {
  return sendSlackNotification({
    type: 'approval_needed',
    title: `承認が必要: ${params.skillKey}`,
    message: params.reason
      ? `*理由:* ${params.reason}\n\nダッシュボードで承認または却下してください。`
      : 'このスキルの実行には人間の承認が必要です。ダッシュボードで確認してください。',
    urgency: 'today',
    metadata: {
      execution_id: params.executionId,
      skill_key: params.skillKey,
      executor: `${params.executorType}:${params.executorId}`,
    },
  });
}
