// AUTO-GENERATED FILE - DO NOT EDIT
// Generated at: 2026-02-04T04:00:00.000Z
// Total skills: 17

import { SkillRegistry } from '../registry';
import * as operations_weekly_review from '../operations/weekly-review.skill';
import * as operations_daily_standup from '../operations/daily-standup.skill';
import * as finance_cost_analysis from '../finance/cost-analysis.skill';
import * as engineering_system_health from '../engineering/system-health.skill';
import * as audit_compliance_check from '../audit/compliance-check.skill';
import * as cs_usage_pattern from '../cs/usage-pattern.skill';
import * as cs_satisfaction_report from '../cs/satisfaction-report.skill';
import * as cs_feedback_analysis from '../cs/feedback-analysis.skill';
import * as ai_affairs_skill_evaluation from '../ai-affairs/skill-evaluation.skill';
import * as ai_affairs_skill_deprecation_check from '../ai-affairs/skill-deprecation-check.skill';
import * as ai_affairs_request_intake from '../ai-affairs/request-intake.skill';
import * as ai_affairs_performance_improvement from '../ai-affairs/performance-improvement.skill';
import * as governance_execution_summary from '../governance/execution-summary.skill';
import * as governance_decision_brief from '../governance/decision-brief.skill';
import * as governance_budget_insight from '../governance/budget-insight.skill';
import * as internal_summary_create from '../internal/summary/create.skill';
import * as marketing_x_trend_research from '../marketing/x-trend-research.skill';

/**
 * レジストリ初期化
 * ビルド時に全スキルが静的に登録されます
 */
export function initializeRegistry(): SkillRegistry {
  const registry = new SkillRegistry();
  registry.register(operations_weekly_review.spec, operations_weekly_review.execute, operations_weekly_review.inputSchema);
  registry.register(operations_daily_standup.spec, operations_daily_standup.execute, operations_daily_standup.inputSchema);
  registry.register(finance_cost_analysis.spec, finance_cost_analysis.execute, finance_cost_analysis.inputSchema);
  registry.register(engineering_system_health.spec, engineering_system_health.execute, engineering_system_health.inputSchema);
  registry.register(audit_compliance_check.spec, audit_compliance_check.execute, audit_compliance_check.inputSchema);
  registry.register(cs_usage_pattern.spec, cs_usage_pattern.execute, cs_usage_pattern.inputSchema);
  registry.register(cs_satisfaction_report.spec, cs_satisfaction_report.execute, cs_satisfaction_report.inputSchema);
  registry.register(cs_feedback_analysis.spec, cs_feedback_analysis.execute, cs_feedback_analysis.inputSchema);
  registry.register(ai_affairs_skill_evaluation.spec, ai_affairs_skill_evaluation.execute, ai_affairs_skill_evaluation.inputSchema);
  registry.register(ai_affairs_skill_deprecation_check.spec, ai_affairs_skill_deprecation_check.execute, ai_affairs_skill_deprecation_check.inputSchema);
  registry.register(ai_affairs_request_intake.spec, ai_affairs_request_intake.execute, ai_affairs_request_intake.inputSchema);
  registry.register(ai_affairs_performance_improvement.spec, ai_affairs_performance_improvement.execute, ai_affairs_performance_improvement.inputSchema);
  registry.register(governance_execution_summary.spec, governance_execution_summary.execute, governance_execution_summary.inputSchema);
  registry.register(governance_decision_brief.spec, governance_decision_brief.execute, governance_decision_brief.inputSchema);
  registry.register(governance_budget_insight.spec, governance_budget_insight.execute, governance_budget_insight.inputSchema);
  registry.register(internal_summary_create.spec, internal_summary_create.execute, internal_summary_create.inputSchema);
  registry.register(marketing_x_trend_research.spec, marketing_x_trend_research.execute, marketing_x_trend_research.inputSchema);
  return registry;
}
