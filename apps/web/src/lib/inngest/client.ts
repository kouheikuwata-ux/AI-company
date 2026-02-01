import { Inngest } from 'inngest';

/**
 * Inngest クライアント
 */
export const inngest = new Inngest({
  id: 'ai-company-os',
  eventKey: process.env.INNGEST_EVENT_KEY,
});

/**
 * スキル実行イベント
 */
export interface SkillExecuteRequestedEvent {
  name: 'skill/execute.requested';
  data: {
    skill_key: string;
    input: Record<string, unknown>;
    idempotency_key: string;
    executor_type: 'user' | 'agent' | 'system';
    executor_id: string;
    legal_responsible_user_id: string;
    responsibility_level: number;
    tenant_id: string;
    trace_id: string;
    request_origin: 'api' | 'scheduled' | 'triggered' | 'manual';
  };
}

/**
 * スキル実行完了イベント
 */
export interface SkillExecuteCompletedEvent {
  name: 'skill/execute.completed';
  data: {
    execution_id: string;
    state: string;
    tenant_id: string;
  };
}

/**
 * 全イベント型
 */
export type Events = {
  'skill/execute.requested': SkillExecuteRequestedEvent;
  'skill/execute.completed': SkillExecuteCompletedEvent;
};
