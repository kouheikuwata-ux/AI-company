/**
 * AI Company OS - Agent Type Definitions
 *
 * エージェント = 会社の役職・部門を担うAI
 * 人間は最終意思決定者として残り、エージェントは執行を補助する
 */

import { z } from 'zod';
import type { ResponsibilityLevel } from '@ai-company-os/skill-spec';

// =============================================================================
// Agent Role Definitions (会社の役職)
// =============================================================================

export const AgentRole = {
  // C-Suite (経営層) - 戦略的意思決定の補助
  CEO: 'ceo',           // 最高経営責任者 - 戦略・例外処理・最終承認
  CFO: 'cfo',           // 最高財務責任者 - 予算・コスト・財務レポート
  COO: 'coo',           // 最高執行責任者 - 業務オペレーション・ワークフロー
  CTO: 'cto',           // 最高技術責任者 - システム健全性・技術改善

  // Department Heads (部門長) - 日常業務の執行
  HR_MANAGER: 'hr_manager',           // 人事部長 - スキル管理（採用=スキル追加）
  CS_MANAGER: 'cs_manager',           // CS部長 - 顧客対応・フィードバック
  PRODUCT_MANAGER: 'product_manager', // PM - 製品開発・要件整理
  SALES_MANAGER: 'sales_manager',     // 営業部長 - 営業活動支援

  // Staff (スタッフ) - 定型業務の自動実行
  ANALYST: 'analyst',               // アナリスト - データ分析・レポート
  COORDINATOR: 'coordinator',       // コーディネーター - スケジュール・調整
  AUDITOR: 'auditor',               // 監査役 - コンプライアンス・監査
} as const;

export type AgentRole = typeof AgentRole[keyof typeof AgentRole];

// =============================================================================
// Agent Department (部門)
// =============================================================================

export const Department = {
  EXECUTIVE: 'executive',       // 経営企画
  AI_AFFAIRS: 'ai_affairs',     // AI事部門（スキル管理）
  FINANCE: 'finance',           // 財務
  OPERATIONS: 'operations',     // オペレーション
  ENGINEERING: 'engineering',   // エンジニアリング
  CUSTOMER_SUCCESS: 'cs',       // カスタマーサクセス
  PRODUCT: 'product',           // プロダクト
  SALES: 'sales',               // 営業
} as const;

export type Department = typeof Department[keyof typeof Department];

// =============================================================================
// Agent Capability (エージェントの能力)
// =============================================================================

export const AgentCapability = {
  // 分析系
  ANALYZE_DATA: 'analyze_data',
  GENERATE_REPORT: 'generate_report',
  DETECT_ANOMALY: 'detect_anomaly',

  // 意思決定支援系
  PREPARE_DECISION: 'prepare_decision',
  SUMMARIZE_OPTIONS: 'summarize_options',
  ASSESS_RISK: 'assess_risk',

  // 実行系
  EXECUTE_WORKFLOW: 'execute_workflow',
  COORDINATE_TASKS: 'coordinate_tasks',
  SEND_NOTIFICATION: 'send_notification',

  // 管理系
  MANAGE_BUDGET: 'manage_budget',
  MANAGE_SKILLS: 'manage_skills',
  MANAGE_SCHEDULE: 'manage_schedule',

  // 監査系
  AUDIT_COMPLIANCE: 'audit_compliance',
  REVIEW_EXECUTION: 'review_execution',
  TRACK_METRICS: 'track_metrics',
} as const;

export type AgentCapability = typeof AgentCapability[keyof typeof AgentCapability];

// =============================================================================
// Agent Status
// =============================================================================

export const AgentStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  MAINTENANCE: 'maintenance',
  SUSPENDED: 'suspended',
} as const;

export type AgentStatus = typeof AgentStatus[keyof typeof AgentStatus];

// =============================================================================
// Agent Specification Schema
// =============================================================================

export const AgentSpecSchema = z.object({
  // Identity
  id: z.string().uuid(),
  key: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  name: z.string().min(1).max(100),
  description: z.string().max(1000),

  // Organization
  role: z.nativeEnum(AgentRole),
  department: z.nativeEnum(Department),
  reports_to: z.string().optional(),  // 上司のagent_key

  // Capabilities
  capabilities: z.array(z.nativeEnum(AgentCapability)),
  allowed_skills: z.array(z.string()),  // 使用可能なスキルのkey

  // Responsibility
  max_responsibility_level: z.number().min(0).max(3) as z.ZodType<ResponsibilityLevel>,
  requires_human_approval_for: z.array(z.string()).default([]),

  // Budget
  budget_scope: z.enum(['unlimited', 'department', 'self']),
  daily_budget_limit: z.number().optional(),

  // Schedule
  working_hours: z.object({
    timezone: z.string().default('Asia/Tokyo'),
    start_hour: z.number().min(0).max(23).default(9),
    end_hour: z.number().min(0).max(23).default(18),
    working_days: z.array(z.number().min(0).max(6)).default([1, 2, 3, 4, 5]),
  }).optional(),

  // Automation
  scheduled_tasks: z.array(z.object({
    task_key: z.string(),
    description: z.string().optional(),
    cron: z.string(),
    skill_key: z.string(),
    default_input: z.record(z.unknown()).optional(),
  })).default([]),

  // Triggers
  event_triggers: z.array(z.object({
    event_type: z.string(),
    description: z.string().optional(),
    skill_key: z.string(),
    condition: z.string().optional(),
    default_input: z.record(z.unknown()).optional(),
  })).default([]),

  // Status
  status: z.nativeEnum(AgentStatus).default('active'),

  // Metadata
  version: z.string().default('1.0.0'),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type AgentSpec = z.infer<typeof AgentSpecSchema>;

// Extracted types for convenience
export type ScheduledTask = AgentSpec['scheduled_tasks'][number];
export type EventTrigger = AgentSpec['event_triggers'][number];

// =============================================================================
// Agent Execution Context
// =============================================================================

export interface AgentContext {
  agent: AgentSpec;
  tenant_id: string;
  legal_responsible_user_id: string;  // 常に人間
  trace_id: string;
  parent_execution_id?: string;
}

// =============================================================================
// Agent Task (エージェントが実行するタスク)
// =============================================================================

export interface AgentTask {
  id: string;
  agent_key: string;
  skill_key: string;
  input: Record<string, unknown>;
  priority: 'critical' | 'high' | 'normal' | 'low';
  scheduled_at?: string;
  deadline?: string;
  depends_on?: string[];  // 他のタスクID
  created_at: string;
}

// =============================================================================
// Agent Message (エージェント間通信)
// =============================================================================

export interface AgentMessage {
  id: string;
  from_agent: string;
  to_agent: string;
  type: 'request' | 'response' | 'notification' | 'escalation';
  subject: string;
  body: Record<string, unknown>;
  priority: 'critical' | 'high' | 'normal' | 'low';
  requires_response: boolean;
  response_deadline?: string;
  created_at: string;
}

// =============================================================================
// Escalation (上位エージェントへのエスカレーション)
// =============================================================================

export interface Escalation {
  id: string;
  from_agent: string;
  to_agent: string;
  reason: 'budget_exceeded' | 'approval_required' | 'exception' | 'error' | 'policy_violation';
  context: Record<string, unknown>;
  recommended_actions: string[];
  urgency: 'immediate' | 'today' | 'this_week';
  created_at: string;
  resolved_at?: string;
  resolution?: string;
}
