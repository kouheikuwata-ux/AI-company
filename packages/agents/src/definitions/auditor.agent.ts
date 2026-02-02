/**
 * Auditor Agent - 監査役
 *
 * 役割:
 * - コンプライアンスチェック
 * - 監査ログのレビュー
 * - セキュリティ監視
 * - ポリシー違反の検出
 *
 * CTOの下で技術的なコンプライアンスと監査を担当
 */

import type { AgentSpec } from '../types';
import { AgentRole, Department, AgentCapability, AgentStatus } from '../types';

export const auditorAgent: AgentSpec = {
  id: 'a0000001-0000-0000-0000-000000000008',
  key: 'auditor',
  name: 'Auditor Agent',
  description: 'コンプライアンスと監査を担当。違反検出と報告。',

  role: AgentRole.AUDITOR,
  department: Department.ENGINEERING,
  reports_to: 'cto',

  capabilities: [
    AgentCapability.AUDIT_COMPLIANCE,
    AgentCapability.REVIEW_EXECUTION,
    AgentCapability.DETECT_ANOMALY,
    AgentCapability.GENERATE_REPORT,
    AgentCapability.ASSESS_RISK,
  ],

  allowed_skills: [
    'audit.compliance-check',
    'audit.log-review',
    'audit.security-audit',
    'audit.policy-violation',
    'audit.access-review',
    'audit.pii-scan',
    'internal.summary.create',
  ],

  max_responsibility_level: 2,  // AI_WITH_REVIEW
  requires_human_approval_for: [
    'audit.report_external',
    'security.incident_escalate',
  ],

  budget_scope: 'self',
  daily_budget_limit: 3.0,  // $3/day

  working_hours: {
    timezone: 'Asia/Tokyo',
    start_hour: 0,   // 24時間監視
    end_hour: 24,
    working_days: [0, 1, 2, 3, 4, 5, 6],  // 毎日
  },

  scheduled_tasks: [
    {
      task_key: 'daily-audit-log-review',
      cron: '0 6 * * *',  // 毎日6時
      skill_key: 'audit.log-review',
      default_input: {
        period: 'last_24h',
        focus_areas: ['permission_changes', 'failed_executions', 'budget_overruns'],
      },
    },
    {
      task_key: 'weekly-compliance-check',
      cron: '0 5 * * 1',  // 毎週月曜5時
      skill_key: 'audit.compliance-check',
      default_input: {
        check_type: 'full',
        include_recommendations: true,
      },
    },
    {
      task_key: 'daily-pii-scan',
      cron: '0 3 * * *',  // 毎日3時
      skill_key: 'audit.pii-scan',
      default_input: {
        scan_scope: 'logs',
        alert_on_detection: true,
      },
    },
    {
      task_key: 'monthly-access-review',
      cron: '0 4 1 * *',  // 毎月1日4時
      skill_key: 'audit.access-review',
      default_input: {
        check_unused_permissions: true,
        check_privilege_escalation: true,
      },
    },
  ],

  event_triggers: [
    {
      event_type: 'security.suspicious_activity',
      skill_key: 'audit.security-audit',
    },
    {
      event_type: 'policy.violation_detected',
      skill_key: 'audit.policy-violation',
    },
    {
      event_type: 'pii.detected_in_logs',
      skill_key: 'audit.pii-scan',
    },
    {
      event_type: 'permission.elevated',
      skill_key: 'audit.access-review',
    },
  ],

  status: AgentStatus.ACTIVE,
  version: '1.0.0',
};
