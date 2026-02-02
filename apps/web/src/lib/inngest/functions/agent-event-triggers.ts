/**
 * Agent Event Triggers - イベント駆動エージェントタスク
 *
 * 各エージェントの event_triggers に定義されたイベントを処理し、
 * 対応するスキルを実行する。
 *
 * 設計原則：
 * - イベントは複数のエージェントをトリガーできる
 * - 条件が設定されている場合は評価する
 * - 全てのトリガーは監査ログに記録
 */

import { inngest } from '../client';
import { agentRegistry } from '@ai-company-os/agents';
import { randomUUID } from 'crypto';

// システム定数
const SYSTEM_ADMIN_USER_ID = process.env.SYSTEM_ADMIN_USER_ID || 'system-admin';
const SYSTEM_TENANT_ID = process.env.SYSTEM_TENANT_ID || 'default';

/**
 * イベントデータの型
 */
interface EventData {
  [key: string]: unknown;
}

/**
 * 条件評価（簡易版）
 * 実際の実装ではより堅牢な評価エンジンを使用
 */
function evaluateCondition(condition: string | undefined, eventData: EventData): boolean {
  if (!condition) return true;

  try {
    // 簡易的な条件評価: "key == value" または "key > value" 形式をサポート
    const match = condition.match(/^(\w+)\s*(==|!=|>|>=|<|<=)\s*(.+)$/);
    if (!match) return true;

    const [, key, operator, valueStr] = match;
    const eventValue = eventData[key];
    const conditionValue = valueStr.startsWith('"')
      ? valueStr.slice(1, -1)
      : parseFloat(valueStr);

    switch (operator) {
      case '==':
        return eventValue === conditionValue || eventValue === valueStr;
      case '!=':
        return eventValue !== conditionValue && eventValue !== valueStr;
      case '>':
        return typeof eventValue === 'number' && eventValue > (conditionValue as number);
      case '>=':
        return typeof eventValue === 'number' && eventValue >= (conditionValue as number);
      case '<':
        return typeof eventValue === 'number' && eventValue < (conditionValue as number);
      case '<=':
        return typeof eventValue === 'number' && eventValue <= (conditionValue as number);
      default:
        return true;
    }
  } catch {
    console.warn(`Failed to evaluate condition: ${condition}`);
    return true;
  }
}

/**
 * 汎用イベントハンドラー
 *
 * 全てのエージェントイベントをキャッチし、適切なエージェントにルーティング
 */
export const agentEventHandler = inngest.createFunction(
  {
    id: 'agent-event-handler',
    name: 'Agent Event Handler',
  },
  [
    // Budget/Cost events (CFO)
    { event: 'budget.threshold_warning' },
    { event: 'budget.threshold_exceeded' },
    { event: 'cost.anomaly_detected' },
    { event: 'execution.cost_spike' },

    // System/Engineering events (CTO)
    { event: 'system.error_spike' },
    { event: 'skill.latency_degradation' },
    { event: 'security.vulnerability_detected' },
    { event: 'deployment.failed' },

    // Customer events (CS Manager)
    { event: 'feedback.negative' },
    { event: 'usage.anomaly' },
    { event: 'user.churn_risk' },

    // Audit/Security events (Auditor)
    { event: 'security.suspicious_activity' },
    { event: 'policy.violation_detected' },
    { event: 'pii.detected_in_logs' },
    { event: 'permission.elevated' },

    // Analytics events (Analyst)
    { event: 'metrics.threshold_breach' },
    { event: 'report.requested' },

    // HR events (HR Manager)
    { event: 'request.created' },
    { event: 'skill.performance_degraded' },
    { event: 'skill.version_published' },

    // Operations events (COO)
    { event: 'workflow.blocked' },
    { event: 'task.overdue' },
    { event: 'execution.failure_rate_high' },

    // Escalation events (CEO)
    { event: 'escalation.critical' },
  ],
  async ({ event, step }) => {
    const eventType = event.name;
    const eventData = event.data as EventData;

    console.log(`[Agent Event Handler] Received event: ${eventType}`);

    // このイベントをトリガーとして持つエージェントを取得
    const triggeredAgents = agentRegistry.getAgentsForEvent(eventType);

    if (triggeredAgents.length === 0) {
      console.log(`[Agent Event Handler] No agents configured for event: ${eventType}`);
      return { status: 'no_handlers', event_type: eventType };
    }

    const results: Array<{
      agent: string;
      skill: string;
      status: 'triggered' | 'skipped';
      reason?: string;
    }> = [];

    // 各エージェントのトリガーを処理
    for (const { agent, trigger } of triggeredAgents) {
      // 条件評価
      const conditionMet = evaluateCondition(trigger.condition, eventData);

      if (!conditionMet) {
        results.push({
          agent: agent.key,
          skill: trigger.skill_key,
          status: 'skipped',
          reason: `Condition not met: ${trigger.condition}`,
        });
        continue;
      }

      // スキル実行イベントを発行
      await step.sendEvent(`trigger-${agent.key}-${trigger.skill_key}`, {
        name: 'skill/execute.requested',
        data: {
          skill_key: trigger.skill_key,
          input: {
            ...(trigger.default_input || {}),
            _event: eventData,
            _event_type: eventType,
          },
          idempotency_key: `event-${eventType}-${agent.key}-${Date.now()}`,
          executor_type: 'agent',
          executor_id: agent.id,
          legal_responsible_user_id: SYSTEM_ADMIN_USER_ID,
          responsibility_level: agent.max_responsibility_level,
          tenant_id: SYSTEM_TENANT_ID,
          trace_id: randomUUID(),
          request_origin: 'triggered',
        },
      });

      results.push({
        agent: agent.key,
        skill: trigger.skill_key,
        status: 'triggered',
      });

      console.log(`[Agent Event Handler] Triggered ${agent.key} -> ${trigger.skill_key}`);
    }

    return {
      status: 'processed',
      event_type: eventType,
      agents_triggered: results.filter(r => r.status === 'triggered').length,
      agents_skipped: results.filter(r => r.status === 'skipped').length,
      results,
    };
  }
);

/**
 * エスカレーション通知ハンドラー
 *
 * エスカレーションイベントを処理し、必要に応じて人間に通知
 */
export const escalationNotificationHandler = inngest.createFunction(
  {
    id: 'escalation-notification-handler',
    name: 'Escalation Notification Handler',
  },
  [
    { event: 'escalation.to_human' },
    { event: 'escalation.urgent' },
    { event: 'escalation.normal' },
  ],
  async ({ event, step }) => {
    const escalationData = event.data;

    console.log(`[Escalation Handler] Processing: ${event.name}`);

    // 人間へのエスカレーションの場合、通知を記録
    if (event.name === 'escalation.to_human') {
      await step.run('log-human-escalation', async () => {
        // TODO: 実際の通知システムと連携
        // - Slack通知
        // - メール送信
        // - ダッシュボードアラート
        console.log('[Escalation Handler] Human escalation logged', {
          from_agent: escalationData.escalation?.from_agent,
          reason: escalationData.escalation?.reason,
          urgency: escalationData.escalation?.urgency,
        });

        return { notified: true };
      });
    }

    // 通常のエスカレーション（エージェント間）
    if (escalationData.escalation?.to_agent && escalationData.escalation.to_agent !== 'human') {
      const toAgent = agentRegistry.get(escalationData.escalation.to_agent);

      if (toAgent) {
        // 対象エージェントのエスカレーション用トリガーを探す
        const escalationTrigger = toAgent.event_triggers.find(
          t => t.event_type === 'escalation.critical' || t.event_type.startsWith('escalation.')
        );

        if (escalationTrigger) {
          await step.sendEvent('escalate-to-agent', {
            name: 'skill/execute.requested',
            data: {
              skill_key: escalationTrigger.skill_key,
              input: {
                ...(escalationTrigger.default_input || {}),
                _escalation: escalationData.escalation,
              },
              idempotency_key: `escalation-${escalationData.escalation.id}`,
              executor_type: 'agent',
              executor_id: toAgent.id,
              legal_responsible_user_id: SYSTEM_ADMIN_USER_ID,
              responsibility_level: toAgent.max_responsibility_level,
              tenant_id: SYSTEM_TENANT_ID,
              trace_id: randomUUID(),
              request_origin: 'triggered',
            },
          });

          console.log(`[Escalation Handler] Escalated to ${toAgent.key}`);
        }
      }
    }

    return {
      status: 'processed',
      escalation_type: event.name,
      to_agent: escalationData.escalation?.to_agent || 'unknown',
    };
  }
);

/**
 * エージェントメッセージハンドラー
 *
 * エージェント間メッセージを処理
 */
export const agentMessageHandler = inngest.createFunction(
  {
    id: 'agent-message-handler',
    name: 'Agent Message Handler',
  },
  [
    { event: 'agent.message.request' },
    { event: 'agent.message.response' },
    { event: 'agent.message.notification' },
  ],
  async ({ event, step }) => {
    const messageData = event.data;
    const message = messageData.message;

    console.log(`[Agent Message Handler] Processing: ${event.name}`, {
      from: message?.from_agent,
      to: message?.to_agent,
      type: message?.type,
    });

    // リクエストメッセージの場合、対象エージェントにルーティング
    if (message?.type === 'request' && message.to_agent) {
      const toAgent = agentRegistry.get(message.to_agent);

      if (toAgent) {
        // 対象エージェントの適切なスキルを選択
        // TODO: メッセージの内容に基づいてスキルを選択するロジック
        console.log(`[Agent Message Handler] Routing request to ${toAgent.key}`);
      }
    }

    // 通知メッセージはログのみ
    if (message?.type === 'notification') {
      await step.run('log-notification', async () => {
        console.log(`[Agent Message Handler] Notification logged`, {
          subject: message.subject,
          priority: message.priority,
        });
        return { logged: true };
      });
    }

    return {
      status: 'processed',
      message_type: message?.type,
      from_agent: message?.from_agent,
      to_agent: message?.to_agent,
    };
  }
);

// Export all functions
export const agentEventTriggerFunctions = [
  agentEventHandler,
  escalationNotificationHandler,
  agentMessageHandler,
];
