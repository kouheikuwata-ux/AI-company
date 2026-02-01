import type { TypedSupabaseClient } from '@ai-company-os/database';
import type { ExecutorType } from '@ai-company-os/skill-spec';

/**
 * 監査ログエントリ
 */
export interface AuditLogEntry {
  action: string;
  actor_type: ExecutorType;
  actor_id: string;
  resource_type: string;
  resource_id: string;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any;

/**
 * 監査ログサービス
 */
export class AuditLogger {
  private db: AnySupabaseClient;

  constructor(db: TypedSupabaseClient) {
    this.db = db;
  }

  /**
   * 監査ログ記録
   */
  async log(tenantId: string, entry: AuditLogEntry): Promise<void> {
    const { error } = await this.db.from('audit_logs').insert({
      tenant_id: tenantId,
      action: entry.action,
      actor_type: entry.actor_type,
      actor_id: entry.actor_id,
      resource_type: entry.resource_type,
      resource_id: entry.resource_id,
      metadata: entry.metadata || {},
      ip_address: entry.ip_address || null,
      user_agent: entry.user_agent || null,
    });

    if (error) {
      // 監査ログの失敗は警告のみ（処理は続行）
      console.warn(`Failed to write audit log: ${error.message}`);
    }
  }

  /**
   * スキル実行の監査ログ
   */
  async logSkillExecution(
    tenantId: string,
    executionId: string,
    action: 'started' | 'completed' | 'failed' | 'cancelled',
    actorType: ExecutorType,
    actorId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log(tenantId, {
      action: `skill.execute.${action}`,
      actor_type: actorType,
      actor_id: actorId,
      resource_type: 'skill_execution',
      resource_id: executionId,
      metadata,
    });
  }

  /**
   * 承認の監査ログ
   */
  async logApproval(
    tenantId: string,
    executionId: string,
    action: 'approved' | 'rejected',
    approverId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log(tenantId, {
      action: `approval.${action}`,
      actor_type: 'user',
      actor_id: approverId,
      resource_type: 'skill_execution',
      resource_id: executionId,
      metadata,
    });
  }

  /**
   * 予算の監査ログ
   */
  async logBudgetAction(
    tenantId: string,
    budgetId: string,
    action: 'reserved' | 'consumed' | 'released',
    actorType: ExecutorType,
    actorId: string,
    amount: number
  ): Promise<void> {
    await this.log(tenantId, {
      action: `budget.${action}`,
      actor_type: actorType,
      actor_id: actorId,
      resource_type: 'budget',
      resource_id: budgetId,
      metadata: { amount },
    });
  }

  /**
   * 監査ログ検索
   */
  async search(
    tenantId: string,
    filters: {
      action?: string;
      actor_id?: string;
      resource_type?: string;
      resource_id?: string;
      from_date?: string;
      to_date?: string;
    },
    limit = 100,
    offset = 0
  ) {
    let query = this.db
      .from('audit_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.action) {
      query = query.eq('action', filters.action);
    }
    if (filters.actor_id) {
      query = query.eq('actor_id', filters.actor_id);
    }
    if (filters.resource_type) {
      query = query.eq('resource_type', filters.resource_type);
    }
    if (filters.resource_id) {
      query = query.eq('resource_id', filters.resource_id);
    }
    if (filters.from_date) {
      query = query.gte('created_at', filters.from_date);
    }
    if (filters.to_date) {
      query = query.lte('created_at', filters.to_date);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to search audit logs: ${error.message}`);
    }

    return data || [];
  }
}
