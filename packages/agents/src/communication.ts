/**
 * Agent Communication Service - エージェント間通信サービス
 *
 * エージェント間のメッセージ送受信とエスカレーションを管理。
 * Inngest イベントと連携して非同期処理を実現。
 *
 * 設計原則：
 * - 全てのメッセージは監査可能
 * - エスカレーションは報告先チェーンを辿る
 * - 人間への通知が必要な場合は明示的に記録
 */

import { randomUUID } from 'crypto';
import type { AgentMessage, Escalation, AgentSpec } from './types';
import type { AgentRegistry } from './registry';

/**
 * メッセージ送信オプション
 */
export interface SendMessageOptions {
  from_agent: string;
  to_agent: string;
  type: AgentMessage['type'];
  subject: string;
  body: Record<string, unknown>;
  priority?: AgentMessage['priority'];
  requires_response?: boolean;
  response_deadline?: string;
}

/**
 * エスカレーションオプション
 */
export interface EscalateOptions {
  from_agent: string;
  reason: Escalation['reason'];
  context: Record<string, unknown>;
  recommended_actions?: string[];
  urgency?: Escalation['urgency'];
}

/**
 * 通信結果
 */
export interface CommunicationResult {
  success: boolean;
  message_id?: string;
  escalation_id?: string;
  recipient_agent?: string;
  event_name?: string;
  error?: string;
}

/**
 * エージェント通信サービス
 */
export class AgentCommunicationService {
  private registry: AgentRegistry;
  private sendEvent: (event: { name: string; data: Record<string, unknown> }) => Promise<void>;

  constructor(
    registry: AgentRegistry,
    sendEvent: (event: { name: string; data: Record<string, unknown> }) => Promise<void>
  ) {
    this.registry = registry;
    this.sendEvent = sendEvent;
  }

  /**
   * エージェント間メッセージを送信
   */
  async sendMessage(options: SendMessageOptions): Promise<CommunicationResult> {
    const fromAgent = this.registry.get(options.from_agent);
    const toAgent = this.registry.get(options.to_agent);

    if (!fromAgent) {
      return {
        success: false,
        error: `送信元エージェント ${options.from_agent} が見つかりません`,
      };
    }

    if (!toAgent) {
      return {
        success: false,
        error: `宛先エージェント ${options.to_agent} が見つかりません`,
      };
    }

    const message: AgentMessage = {
      id: randomUUID(),
      from_agent: options.from_agent,
      to_agent: options.to_agent,
      type: options.type,
      subject: options.subject,
      body: options.body,
      priority: options.priority || 'normal',
      requires_response: options.requires_response || false,
      response_deadline: options.response_deadline,
      created_at: new Date().toISOString(),
    };

    // Inngest イベントとして送信
    const eventName = `agent.message.${options.type}`;
    await this.sendEvent({
      name: eventName,
      data: {
        message,
        from_agent_id: fromAgent.id,
        to_agent_id: toAgent.id,
      },
    });

    return {
      success: true,
      message_id: message.id,
      recipient_agent: options.to_agent,
      event_name: eventName,
    };
  }

  /**
   * 報告先エージェントにエスカレーション
   */
  async escalate(options: EscalateOptions): Promise<CommunicationResult> {
    const fromAgent = this.registry.get(options.from_agent);

    if (!fromAgent) {
      return {
        success: false,
        error: `エージェント ${options.from_agent} が見つかりません`,
      };
    }

    // 報告先を特定
    const toAgentKey = fromAgent.reports_to;
    if (!toAgentKey) {
      // 報告先がない場合（CEOなど）は人間にエスカレーション
      return this.escalateToHuman(fromAgent, options);
    }

    const toAgent = this.registry.get(toAgentKey);
    if (!toAgent) {
      return {
        success: false,
        error: `報告先エージェント ${toAgentKey} が見つかりません`,
      };
    }

    const escalation: Escalation = {
      id: randomUUID(),
      from_agent: options.from_agent,
      to_agent: toAgentKey,
      reason: options.reason,
      context: options.context,
      recommended_actions: options.recommended_actions || [],
      urgency: options.urgency || 'today',
      created_at: new Date().toISOString(),
    };

    // 緊急度に応じたイベント名
    const eventName =
      options.urgency === 'immediate'
        ? 'escalation.critical'
        : options.urgency === 'today'
          ? 'escalation.urgent'
          : 'escalation.normal';

    await this.sendEvent({
      name: eventName,
      data: {
        escalation,
        from_agent_id: fromAgent.id,
        to_agent_id: toAgent.id,
      },
    });

    return {
      success: true,
      escalation_id: escalation.id,
      recipient_agent: toAgentKey,
      event_name: eventName,
    };
  }

  /**
   * 人間へのエスカレーション（CEOからのエスカレーションなど）
   */
  private async escalateToHuman(
    agent: AgentSpec,
    options: EscalateOptions
  ): Promise<CommunicationResult> {
    const escalation: Escalation = {
      id: randomUUID(),
      from_agent: options.from_agent,
      to_agent: 'human',
      reason: options.reason,
      context: options.context,
      recommended_actions: options.recommended_actions || [],
      urgency: options.urgency || 'today',
      created_at: new Date().toISOString(),
    };

    await this.sendEvent({
      name: 'escalation.to_human',
      data: {
        escalation,
        from_agent_id: agent.id,
        requires_human_decision: true,
      },
    });

    return {
      success: true,
      escalation_id: escalation.id,
      recipient_agent: 'human',
      event_name: 'escalation.to_human',
    };
  }

  /**
   * ブロードキャストメッセージ（全エージェントに通知）
   */
  async broadcast(
    from_agent: string,
    subject: string,
    body: Record<string, unknown>,
    filter?: { department?: string; capability?: string }
  ): Promise<CommunicationResult[]> {
    const fromAgent = this.registry.get(from_agent);
    if (!fromAgent) {
      return [
        {
          success: false,
          error: `送信元エージェント ${from_agent} が見つかりません`,
        },
      ];
    }

    // フィルタに基づいてエージェントを取得
    let agents: AgentSpec[] = this.registry.getAll();

    if (filter?.department) {
      agents = agents.filter((a: AgentSpec) => a.department === filter.department);
    }
    if (filter?.capability) {
      agents = agents.filter((a: AgentSpec) =>
        a.capabilities.includes(filter.capability as never)
      );
    }

    // 自分自身は除外
    agents = agents.filter((a: AgentSpec) => a.key !== from_agent);

    const results: CommunicationResult[] = [];

    for (const agent of agents) {
      const result = await this.sendMessage({
        from_agent,
        to_agent: agent.key,
        type: 'notification',
        subject,
        body,
        priority: 'normal',
      });
      results.push(result);
    }

    return results;
  }

  /**
   * 部門長にリクエスト
   */
  async requestFromDepartmentHead(
    from_agent: string,
    department: string,
    subject: string,
    body: Record<string, unknown>,
    requires_response: boolean = true
  ): Promise<CommunicationResult> {
    // 部門長を探す
    const agents: AgentSpec[] = this.registry.getAll();
    const departmentHead = agents.find(
      (a: AgentSpec) =>
        a.department === department &&
        (a.role.includes('manager') || a.role.includes('cfo') || a.role.includes('coo') || a.role.includes('cto'))
    );

    if (!departmentHead) {
      return {
        success: false,
        error: `部門 ${department} の責任者が見つかりません`,
      };
    }

    return this.sendMessage({
      from_agent,
      to_agent: departmentHead.key,
      type: 'request',
      subject,
      body,
      priority: 'normal',
      requires_response,
    });
  }
}

/**
 * 通信サービスのファクトリー関数
 */
export function createCommunicationService(
  registry: AgentRegistry,
  sendEvent: (event: { name: string; data: Record<string, unknown> }) => Promise<void>
): AgentCommunicationService {
  return new AgentCommunicationService(registry, sendEvent);
}
