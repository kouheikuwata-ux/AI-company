import type { TypedSupabaseClient } from '@ai-company-os/database';
import type {
  ExecutionContext,
  ExecutionResult,
  ExecutionState,
  SkillSpec,
  SkillResult,
  SkillHandler,
  SkillContext,
  SkillLogger,
  LLMClient,
} from '@ai-company-os/skill-spec';
import { ResponsibilityLevel, isResponsibilityLevelSufficient } from '@ai-company-os/skill-spec';
import { StateMachine, type Execution } from './state-machine';
import { BudgetService, type BudgetReservation } from './budget';
import { AuditLogger } from './audit';
import { PIIGuard } from './pii-guard';
import {
  SkillNotFoundError,
  ValidationError,
  ResponsibilityError,
  TimeoutError,
} from './errors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any;

/**
 * スキルレジストリインターフェース
 */
export interface SkillRegistry {
  get(skillKey: string, version?: string): RegisteredSkill | null;
  list(): SkillSpec[];
}

/**
 * 登録済みスキル
 */
export interface RegisteredSkill {
  spec: SkillSpec;
  execute: SkillHandler;
  estimatedCost: number;
  validateInput(input: unknown): { success: boolean; errors?: unknown[] };
  requiresApproval(responsibilityLevel: ResponsibilityLevel): boolean;
}

/**
 * Executor 依存関係
 */
export interface ExecutorDependencies {
  db: TypedSupabaseClient;
  registry: SkillRegistry;
  stateMachine: StateMachine;
  budgetService: BudgetService;
  auditLogger: AuditLogger;
  piiGuard: PIIGuard;
  llmClient: LLMClient;
}

/**
 * スキル実行エンジン
 *
 * 設計原則（v3.0）：
 * 1. HTTPを知らない
 * 2. Inngestを知らない（Adapterを通す）
 * 3. DBトランザクションは明示的に管理
 * 4. State Machineで状態遷移を管理
 * 5. 冪等性を保証
 * 6. 責任モデルを強制
 */
export class SkillExecutor {
  private readonly db: AnySupabaseClient;
  private readonly registry: SkillRegistry;
  private readonly stateMachine: StateMachine;
  private readonly budgetService: BudgetService;
  private readonly auditLogger: AuditLogger;
  private readonly piiGuard: PIIGuard;
  private readonly llmClient: LLMClient;

  constructor(deps: ExecutorDependencies) {
    this.db = deps.db as AnySupabaseClient;
    this.registry = deps.registry;
    this.stateMachine = deps.stateMachine;
    this.budgetService = deps.budgetService;
    this.auditLogger = deps.auditLogger;
    this.piiGuard = deps.piiGuard;
    this.llmClient = deps.llmClient;
  }

  /**
   * スキル実行（冪等性保証）
   */
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    // 1. 冪等性チェック
    const existing = await this.findByIdempotencyKey(
      context.tenant_id,
      context.idempotency_key
    );
    if (existing) {
      return this.toResult(existing);
    }

    // 2. 責任モデル検証
    this.validateResponsibility(context);

    // 3. スキル解決（Build-time Registry）
    const skill = this.registry.get(context.skill_key, context.skill_version);
    if (!skill) {
      throw new SkillNotFoundError(context.skill_key, context.skill_version);
    }

    // 4. 入力検証
    const validationResult = skill.validateInput(context.input);
    if (!validationResult.success) {
      throw new ValidationError(validationResult.errors || []);
    }

    // 5. PII検証
    this.piiGuard.validateForLLM(skill.spec.pii_policy, context.input);

    // 6. 実行レコード作成
    const execution = await this.createExecution(context, skill);

    try {
      // 7. 承認チェック（必要な場合）
      if (skill.requiresApproval(context.responsibility_level)) {
        await this.stateMachine.transition(execution, 'PENDING_APPROVAL');
        await this.createApprovalRequest(context, execution);

        return this.toResult(execution, 'PENDING_APPROVAL');
      }

      // 8. 予算確保
      const budgetReservation = await this.budgetService.reserve(
        context.tenant_id,
        skill.estimatedCost
      );

      await this.updateExecutionBudget(execution.id, budgetReservation);
      await this.stateMachine.transition(execution, 'BUDGET_RESERVED');

      // 9. 実行
      await this.stateMachine.transition(execution, 'RUNNING', {
        started_at: new Date().toISOString(),
      });

      const result = await this.executeWithTimeout(skill, context, execution);

      // 10. 予算消費
      await this.budgetService.consume(budgetReservation.id, result.actual_cost);

      // 11. 完了
      await this.stateMachine.transition(execution, 'COMPLETED', {
        completed_at: new Date().toISOString(),
        result_status: 'success',
        result_summary: this.summarize(result.output),
        budget_consumed_amount: result.actual_cost,
      });

      // 12. 監査ログ
      await this.auditLogger.logSkillExecution(
        context.tenant_id,
        execution.id,
        'completed',
        context.executor_type,
        context.executor_id,
        { skill_key: context.skill_key }
      );

      return this.toResult(execution, 'COMPLETED', result);
    } catch (error) {
      // エラーハンドリング
      await this.handleError(context, execution, error as Error);
      throw error;
    }
  }

  /**
   * 冪等性キーで既存実行を検索
   */
  private async findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string
  ): Promise<Execution | null> {
    const { data, error } = await this.db
      .from('skill_executions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('idempotency_key', idempotencyKey)
      .single();

    if (error || !data) {
      return null;
    }

    return data as unknown as Execution;
  }

  /**
   * 責任モデル検証
   */
  private validateResponsibility(context: ExecutionContext): void {
    // 法的責任者は必須
    if (!context.legal_responsible_user_id) {
      throw new ResponsibilityError('legal_responsible_user_id is required');
    }

    // 責任レベルの妥当性
    if (context.responsibility_level === undefined || context.responsibility_level === null) {
      throw new ResponsibilityError('responsibility_level is required');
    }

    // レベル範囲チェック
    if (
      context.responsibility_level < ResponsibilityLevel.HUMAN_DIRECT ||
      context.responsibility_level > ResponsibilityLevel.AI_INTERNAL_ONLY
    ) {
      throw new ResponsibilityError(
        `Invalid responsibility_level: ${context.responsibility_level}`
      );
    }
  }

  /**
   * 実行レコード作成
   */
  private async createExecution(
    context: ExecutionContext,
    skill: RegisteredSkill
  ): Promise<Execution> {
    const { data, error } = await this.db
      .from('skill_executions')
      .insert({
        idempotency_key: context.idempotency_key,
        tenant_id: context.tenant_id,
        skill_id: skill.spec.key, // 実際はDBのskill_idに解決が必要
        skill_version_id: skill.spec.version,
        skill_key: context.skill_key,
        skill_version: context.skill_version || skill.spec.version,
        executor_type: context.executor_type,
        executor_id: context.executor_id,
        legal_responsible_user_id: context.legal_responsible_user_id,
        responsibility_level: context.responsibility_level,
        approval_chain: context.approval_chain,
        state: 'CREATED',
        trace_id: context.trace_id,
        parent_execution_id: context.parent_execution_id || null,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to create execution: ${error?.message}`);
    }

    // 監査ログ
    await this.auditLogger.logSkillExecution(
      context.tenant_id,
      data.id,
      'started',
      context.executor_type,
      context.executor_id,
      { skill_key: context.skill_key }
    );

    return {
      id: data.id,
      state: data.state as ExecutionState,
    };
  }

  /**
   * 承認リクエスト作成
   */
  private async createApprovalRequest(
    context: ExecutionContext,
    execution: Execution
  ): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24時間後に期限切れ

    await this.db.from('approval_requests').insert({
      tenant_id: context.tenant_id,
      execution_id: execution.id,
      requester_id: context.executor_id,
      status: 'pending',
      scope: context.skill_key,
      expires_at: expiresAt.toISOString(),
    });
  }

  /**
   * 実行の予算情報更新
   */
  private async updateExecutionBudget(
    executionId: string,
    reservation: BudgetReservation
  ): Promise<void> {
    await this.db
      .from('skill_executions')
      .update({
        budget_reserved_amount: reservation.amount,
      })
      .eq('id', executionId);
  }

  /**
   * タイムアウト付き実行
   */
  private async executeWithTimeout(
    skill: RegisteredSkill,
    context: ExecutionContext,
    execution: Execution
  ): Promise<SkillResult> {
    const timeoutMs = skill.spec.safety.timeout_seconds * 1000;

    const logger: SkillLogger = this.createLogger(execution.id);
    const skillContext: SkillContext = {
      execution_id: execution.id,
      tenant_id: context.tenant_id,
      trace_id: context.trace_id,
      logger,
      llm: this.llmClient,
    };

    // PIIマスク
    let processedInput = context.input;
    if (skill.spec.pii_policy.input_contains_pii &&
        skill.spec.pii_policy.handling === 'MASK_BEFORE_LLM') {
      processedInput = this.piiGuard.maskPIIFields(
        context.input,
        skill.spec.pii_policy.pii_fields
      ) as Record<string, unknown>;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new TimeoutError(skill.spec.safety.timeout_seconds));
      }, timeoutMs);

      skill
        .execute(processedInput, skillContext)
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * エラーハンドリング
   */
  private async handleError(
    context: ExecutionContext,
    execution: Execution,
    error: Error
  ): Promise<void> {
    const newState: ExecutionState = error instanceof TimeoutError ? 'TIMEOUT' : 'FAILED';

    await this.stateMachine.transition(execution, newState, {
      completed_at: new Date().toISOString(),
      error_code: error.name,
      error_message: this.piiGuard.sanitizeErrorMessage(error.message),
    });

    // 予算解放
    await this.budgetService.release(execution.id);

    // 監査ログ
    await this.auditLogger.logSkillExecution(
      context.tenant_id,
      execution.id,
      'failed',
      context.executor_type,
      context.executor_id,
      { error: error.name }
    );
  }

  /**
   * 結果サマリー作成
   */
  private summarize(output: Record<string, unknown>): string {
    const sanitized = this.piiGuard.sanitizeForLog(output);
    const json = JSON.stringify(sanitized);
    return json.length > 500 ? json.slice(0, 500) + '...' : json;
  }

  /**
   * 実行結果に変換
   */
  private toResult(
    execution: Execution,
    state?: ExecutionState,
    result?: SkillResult
  ): ExecutionResult {
    return {
      execution_id: execution.id,
      idempotency_key: '', // 実際はDBから取得
      state: state || execution.state,
      result_status: result ? 'success' : undefined,
      output: result?.output,
    };
  }

  /**
   * ロガー作成
   */
  private createLogger(executionId: string): SkillLogger {
    const prefix = `[Execution:${executionId}]`;
    return {
      debug: (msg, data) => console.debug(prefix, msg, data),
      info: (msg, data) => console.info(prefix, msg, data),
      warn: (msg, data) => console.warn(prefix, msg, data),
      error: (msg, data) => console.error(prefix, msg, data),
    };
  }
}
