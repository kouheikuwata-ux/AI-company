/**
 * Runner カスタムエラー
 */

/**
 * ベースエラー
 */
export class RunnerError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'RunnerError';
  }
}

/**
 * スキルが見つからない
 */
export class SkillNotFoundError extends RunnerError {
  constructor(skillKey: string, version?: string) {
    const versionStr = version ? `@${version}` : '';
    super(`Skill not found: ${skillKey}${versionStr}`, 'SKILL_NOT_FOUND');
    this.name = 'SkillNotFoundError';
  }
}

/**
 * 入力検証エラー
 */
export class ValidationError extends RunnerError {
  constructor(public readonly errors: unknown[]) {
    super(`Validation failed: ${JSON.stringify(errors)}`, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

/**
 * 責任モデルエラー
 */
export class ResponsibilityError extends RunnerError {
  constructor(message: string) {
    super(message, 'RESPONSIBILITY_ERROR');
    this.name = 'ResponsibilityError';
  }
}

/**
 * 不正な状態遷移
 */
export class InvalidStateTransitionError extends RunnerError {
  constructor(
    public readonly fromState: string,
    public readonly toState: string
  ) {
    super(`Invalid state transition: ${fromState} -> ${toState}`, 'INVALID_STATE_TRANSITION');
    this.name = 'InvalidStateTransitionError';
  }
}

/**
 * 承認者必須エラー
 */
export class ActorRequiredError extends RunnerError {
  constructor(transition: string) {
    super(`State transition requires an actor: ${transition}`, 'ACTOR_REQUIRED');
    this.name = 'ActorRequiredError';
  }
}

/**
 * 予算なしエラー
 */
export class NoBudgetError extends RunnerError {
  constructor(tenantId: string) {
    super(`No active budget found for tenant: ${tenantId}`, 'NO_BUDGET');
    this.name = 'NoBudgetError';
  }
}

/**
 * 予算超過エラー
 */
export class BudgetExceededError extends RunnerError {
  constructor(
    public readonly available: number,
    public readonly required: number
  ) {
    super(`Budget exceeded: available=${available}, required=${required}`, 'BUDGET_EXCEEDED');
    this.name = 'BudgetExceededError';
  }
}

/**
 * 不正な予約エラー
 */
export class InvalidReservationError extends RunnerError {
  constructor(reservationId: string) {
    super(`Invalid or expired reservation: ${reservationId}`, 'INVALID_RESERVATION');
    this.name = 'InvalidReservationError';
  }
}

/**
 * タイムアウトエラー
 */
export class TimeoutError extends RunnerError {
  constructor(timeoutSeconds: number) {
    super(`Execution timed out after ${timeoutSeconds} seconds`, 'TIMEOUT');
    this.name = 'TimeoutError';
  }
}

/**
 * PII ポリシーエラー
 */
export class PIIPolicyError extends RunnerError {
  constructor(message: string) {
    super(message, 'PII_POLICY_ERROR');
    this.name = 'PIIPolicyError';
  }
}

/**
 * 冪等性エラー（既に処理済み）
 */
export class IdempotencyError extends RunnerError {
  constructor(
    idempotencyKey: string,
    public readonly existingExecutionId: string
  ) {
    super(`Request already processed: ${idempotencyKey}`, 'IDEMPOTENCY_ERROR');
    this.name = 'IdempotencyError';
  }
}
