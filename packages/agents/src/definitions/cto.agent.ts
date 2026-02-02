/**
 * CTO Agent - 最高技術責任者
 *
 * 役割:
 * - システム健全性の監視
 * - 技術的な改善提案
 * - スキルのパフォーマンス分析
 * - セキュリティ・コンプライアンス監視
 *
 * 注意: 技術的な変更の最終決定は人間CTOが行う
 */

import type { AgentSpec } from '../types';
import { AgentRole, Department, AgentCapability, AgentStatus } from '../types';

export const ctoAgent: AgentSpec = {
  id: 'a0000001-0000-0000-0000-000000000004',
  key: 'cto',
  name: 'CTO Agent',
  description: 'システム健全性と技術改善を担当。技術決定は人間CTOが行う。',

  role: AgentRole.CTO,
  department: Department.ENGINEERING,
  reports_to: 'ceo',

  capabilities: [
    AgentCapability.DETECT_ANOMALY,
    AgentCapability.ANALYZE_DATA,
    AgentCapability.GENERATE_REPORT,
    AgentCapability.AUDIT_COMPLIANCE,
    AgentCapability.ASSESS_RISK,
  ],

  allowed_skills: [
    'governance.execution-summary',
    'engineering.system-health',
    'engineering.skill-performance',
    'engineering.improvement-proposal',
    'engineering.security-scan',
    'engineering.dependency-check',
    'internal.summary.create',
  ],

  max_responsibility_level: 2,  // AI_WITH_REVIEW
  requires_human_approval_for: [
    'skill.deploy',
    'skill.rollback',
    'system.config_change',
  ],

  budget_scope: 'department',
  daily_budget_limit: 15.0,  // $15/day (技術分析はコストがかかる)

  working_hours: {
    timezone: 'Asia/Tokyo',
    start_hour: 9,
    end_hour: 21,  // エンジニアリングは遅くまで
    working_days: [1, 2, 3, 4, 5, 6],  // 土曜も監視
  },

  scheduled_tasks: [
    {
      task_key: 'morning-health-check',
      cron: '0 8 * * *',  // 毎日8時
      skill_key: 'engineering.system-health',
      default_input: {
        check_depth: 'full',
      },
    },
    {
      task_key: 'skill-performance-review',
      cron: '0 11 * * 1-5',  // 平日11時
      skill_key: 'engineering.skill-performance',
      default_input: {
        period: 'last_24h',
        threshold_latency_ms: 5000,
        threshold_error_rate: 0.05,
      },
    },
    {
      task_key: 'weekly-security-scan',
      cron: '0 6 * * 0',  // 毎週日曜6時
      skill_key: 'engineering.security-scan',
      default_input: {
        scan_type: 'full',
        include_dependencies: true,
      },
    },
    {
      task_key: 'weekly-improvement-proposals',
      cron: '0 14 * * 5',  // 毎週金曜14時
      skill_key: 'engineering.improvement-proposal',
      default_input: {
        analysis_period: 'weekly',
        max_proposals: 5,
      },
    },
  ],

  event_triggers: [
    {
      event_type: 'system.error_spike',
      skill_key: 'engineering.system-health',
      condition: 'error_count > 10',
    },
    {
      event_type: 'skill.latency_degradation',
      skill_key: 'engineering.skill-performance',
      condition: 'latency_increase_percent > 50',
    },
    {
      event_type: 'security.vulnerability_detected',
      skill_key: 'engineering.security-scan',
    },
    {
      event_type: 'deployment.failed',
      skill_key: 'engineering.system-health',
    },
  ],

  status: AgentStatus.ACTIVE,
  version: '1.0.0',
};
