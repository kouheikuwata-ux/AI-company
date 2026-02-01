import type { ExecutionState } from '@ai-company-os/skill-spec';
import type { TypedSupabaseClient } from '@ai-company-os/database';
import { InvalidStateTransitionError, ActorRequiredError } from './errors';

/**
 * 許可される状態遷移
 */
const ALLOWED_TRANSITIONS: Record<ExecutionState, ExecutionState[]> = {
  CREATED: ['PENDING_APPROVAL', 'BUDGET_RESERVED', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'CANCELLED'],
  APPROVED: ['BUDGET_RESERVED', 'CANCELLED'],
  BUDGET_RESERVED: ['RUNNING', 'CANCELLED'],
  RUNNING: ['COMPLETED', 'FAILED', 'TIMEOUT'],
  COMPLETED: [],
  FAILED: ['ROLLED_BACK'],
  TIMEOUT: ['ROLLED_BACK'],
  CANCELLED: [],
  ROLLED_BACK: [],
};

/**
 * 承認者必須の遷移
 */
const REQUIRES_ACTOR = new Set([
  'CREATED->CANCELLED',
  'PENDING_APPROVAL->APPROVED',
  'PENDING_APPROVAL->CANCELLED',
  'APPROVED->CANCELLED',
  'BUDGET_RESERVED->CANCELLED',
]);

/**
 * 状態遷移が許可されているかチェック
 */
export function isTransitionAllowed(
  fromState: ExecutionState,
  toState: ExecutionState
): boolean {
  return ALLOWED_TRANSITIONS[fromState]?.includes(toState) ?? false;
}

/**
 * 状態遷移に承認者が必要かチェック
 */
export function requiresActor(fromState: ExecutionState, toState: ExecutionState): boolean {
  return REQUIRES_ACTOR.has(`${fromState}->${toState}`);
}

/**
 * 実行情報
 */
export interface Execution {
  id: string;
  state: ExecutionState;
  previous_state?: ExecutionState | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any;

/**
 * 状態遷移マネージャ
 */
export class StateMachine {
  private db: AnySupabaseClient;

  constructor(db: TypedSupabaseClient) {
    this.db = db;
  }

  /**
   * 状態遷移を実行
   */
  async transition(
    execution: Execution,
    newState: ExecutionState,
    updates?: Record<string, unknown>,
    actorId?: string
  ): Promise<void> {
    const currentState = execution.state;

    // 遷移可能性チェック
    if (!isTransitionAllowed(currentState, newState)) {
      throw new InvalidStateTransitionError(currentState, newState);
    }

    // 承認者チェック
    if (requiresActor(currentState, newState) && !actorId) {
      throw new ActorRequiredError(`${currentState}->${newState}`);
    }

    // 状態更新
    const { error: updateError } = await this.db
      .from('skill_executions')
      .update({
        state: newState,
        previous_state: currentState,
        state_changed_at: new Date().toISOString(),
        state_changed_by: actorId || null,
        ...updates,
      })
      .eq('id', execution.id);

    if (updateError) {
      throw new Error(`Failed to update execution state: ${updateError.message}`);
    }

    // 状態遷移ログ
    const { error: logError } = await this.db.from('execution_state_logs').insert({
      execution_id: execution.id,
      from_state: currentState,
      to_state: newState,
      actor_id: actorId || null,
      metadata: updates || null,
    });

    if (logError) {
      // ログ失敗は警告のみ（状態遷移は成功）
      console.warn(`Failed to log state transition: ${logError.message}`);
    }
  }

  /**
   * 現在の状態を取得
   */
  async getState(executionId: string): Promise<ExecutionState | null> {
    const { data, error } = await this.db
      .from('skill_executions')
      .select('state')
      .eq('id', executionId)
      .single();

    if (error || !data) {
      return null;
    }

    return data.state as ExecutionState;
  }

  /**
   * 状態遷移履歴を取得
   */
  async getStateHistory(executionId: string) {
    const { data, error } = await this.db
      .from('execution_state_logs')
      .select('*')
      .eq('execution_id', executionId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to get state history: ${error.message}`);
    }

    return data || [];
  }
}
