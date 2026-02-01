import type { TypedSupabaseClient } from '@ai-company-os/database';
import { NoBudgetError, BudgetExceededError, InvalidReservationError } from './errors';

/**
 * 予算予約結果
 */
export interface BudgetReservation {
  id: string;
  budget_id: string;
  amount: number;
}

/**
 * 予算情報
 */
interface Budget {
  id: string;
  limit_amount: number;
  used_amount: number;
  reserved_amount: number;
  is_hard_limit: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any;

/**
 * 予算サービス
 */
export class BudgetService {
  private db: AnySupabaseClient;

  constructor(db: TypedSupabaseClient) {
    this.db = db;
  }

  /**
   * 予算確保（Reserve）
   */
  async reserve(tenantId: string, amount: number): Promise<BudgetReservation> {
    // 1. 利用可能予算取得
    const { data: budget, error: budgetError } = await this.db
      .from('budgets')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('scope_type', 'tenant')
      .eq('is_active', true)
      .lte('period_start', new Date().toISOString().split('T')[0])
      .gte('period_end', new Date().toISOString().split('T')[0])
      .single();

    if (budgetError || !budget) {
      throw new NoBudgetError(tenantId);
    }

    const typedBudget = budget as Budget;

    // 2. 残高チェック
    const available =
      typedBudget.limit_amount - typedBudget.used_amount - typedBudget.reserved_amount;

    if (available < amount) {
      if (typedBudget.is_hard_limit) {
        throw new BudgetExceededError(available, amount);
      }
      // ソフトリミットの場合は警告のみ
      console.warn(`Budget soft limit exceeded: available=${available}, required=${amount}`);
    }

    // 3. 予約作成
    const { data: reservation, error: reservationError } = await this.db
      .from('budget_reservations')
      .insert({
        budget_id: typedBudget.id,
        amount,
        status: 'reserved',
      })
      .select()
      .single();

    if (reservationError || !reservation) {
      throw new Error(`Failed to create reservation: ${reservationError?.message}`);
    }

    // 4. 予約額を加算
    const { error: updateError } = await this.db
      .from('budgets')
      .update({
        reserved_amount: typedBudget.reserved_amount + amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', typedBudget.id);

    if (updateError) {
      // ロールバック
      await this.db.from('budget_reservations').delete().eq('id', reservation.id);
      throw new Error(`Failed to update budget: ${updateError.message}`);
    }

    return {
      id: reservation.id,
      budget_id: typedBudget.id,
      amount,
    };
  }

  /**
   * 予算消費（Consume）
   */
  async consume(reservationId: string, actualAmount: number): Promise<void> {
    // 予約情報取得
    const { data: reservation, error: getError } = await this.db
      .from('budget_reservations')
      .select('*, budgets(*)')
      .eq('id', reservationId)
      .single();

    if (getError || !reservation || reservation.status !== 'reserved') {
      throw new InvalidReservationError(reservationId);
    }

    // 予約を消費に変換
    const { error: updateReservationError } = await this.db
      .from('budget_reservations')
      .update({
        actual_amount: actualAmount,
        status: 'consumed',
        consumed_at: new Date().toISOString(),
      })
      .eq('id', reservationId);

    if (updateReservationError) {
      throw new Error(`Failed to update reservation: ${updateReservationError.message}`);
    }

    // 予算更新
    const budget = reservation.budgets as Budget;
    const { error: updateBudgetError } = await this.db
      .from('budgets')
      .update({
        reserved_amount: Math.max(0, budget.reserved_amount - reservation.amount),
        used_amount: budget.used_amount + actualAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', budget.id);

    if (updateBudgetError) {
      throw new Error(`Failed to update budget: ${updateBudgetError.message}`);
    }

    // トランザクション記録
    await this.db.from('budget_transactions').insert({
      budget_id: budget.id,
      reservation_id: reservationId,
      amount: actualAmount,
      transaction_type: 'consume',
    });
  }

  /**
   * 予算解放（Release）- キャンセル・失敗時
   */
  async release(executionId: string): Promise<void> {
    // 予約情報取得
    const { data: executions, error: getError } = await this.db
      .from('skill_executions')
      .select('budget_reserved_amount')
      .eq('id', executionId)
      .single();

    if (getError || !executions) {
      return; // 実行が見つからない場合は何もしない
    }

    const { data: reservations } = await this.db
      .from('budget_reservations')
      .select('*, budgets(*)')
      .eq('execution_id', executionId)
      .eq('status', 'reserved');

    if (!reservations || reservations.length === 0) {
      return; // 予約がない場合は何もしない
    }

    for (const reservation of reservations) {
      // 予約を解放
      await this.db
        .from('budget_reservations')
        .update({
          status: 'released',
          released_at: new Date().toISOString(),
        })
        .eq('id', reservation.id);

      // 予算から予約額を減算
      const budget = reservation.budgets as Budget;
      await this.db
        .from('budgets')
        .update({
          reserved_amount: Math.max(0, budget.reserved_amount - reservation.amount),
          updated_at: new Date().toISOString(),
        })
        .eq('id', budget.id);

      // トランザクション記録
      await this.db.from('budget_transactions').insert({
        budget_id: budget.id,
        reservation_id: reservation.id,
        amount: -reservation.amount,
        transaction_type: 'release',
      });
    }
  }

  /**
   * テナントの予算状況を取得
   */
  async getBudgetStatus(tenantId: string) {
    const { data, error } = await this.db
      .from('budgets')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('scope_type', 'tenant')
      .eq('is_active', true)
      .lte('period_start', new Date().toISOString().split('T')[0])
      .gte('period_end', new Date().toISOString().split('T')[0])
      .single();

    if (error || !data) {
      return null;
    }

    const budget = data as Budget;
    return {
      limit: budget.limit_amount,
      used: budget.used_amount,
      reserved: budget.reserved_amount,
      available: budget.limit_amount - budget.used_amount - budget.reserved_amount,
      utilizationRate: (budget.used_amount / budget.limit_amount) * 100,
    };
  }
}
