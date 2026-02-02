/**
 * AI Company OS - Agents Package
 *
 * エージェント = 会社の役職を担うAI
 *
 * 組織構造:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                        Human CEO                            │
 * │                    (最終意思決定者)                          │
 * └─────────────────────────────────────────────────────────────┘
 *                              │
 *                              ▼
 * ┌─────────────────────────────────────────────────────────────┐
 * │                       CEO Agent                             │
 * │              (戦略材料準備・例外対応)                        │
 * └─────────────────────────────────────────────────────────────┘
 *          │                   │                   │
 *          ▼                   ▼                   ▼
 * ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
 * │   CFO Agent   │   │   COO Agent   │   │   CTO Agent   │
 * │  (財務・予算)  │   │ (オペレーション) │   │  (技術・改善)  │
 * └───────────────┘   └───────────────┘   └───────────────┘
 *         │                   │                   │
 *         ▼                   │                   ▼
 * ┌───────────────┐           │           ┌───────────────┐
 * │    Analyst    │           │           │    Auditor    │
 * │  (データ分析)  │           │           │   (監査役)    │
 * └───────────────┘           │           └───────────────┘
 *                             │
 *          ┌──────────────────┼──────────────────┐
 *          ▼                                     ▼
 * ┌───────────────────┐               ┌───────────────────┐
 * │  HR Manager       │               │  CS Manager       │
 * │  (AI事部門)        │               │  (カスタマー成功)  │
 * └───────────────────┘               └───────────────────┘
 *
 * 責任原則:
 * - 全ての実行は人間が法的責任を負う
 * - エージェントは執行補助のみ
 * - 重要な決定は人間承認必須
 */

// Types
export * from './types';

// Registry
export { agentRegistry, allAgents, organizationChart } from './registry';

// Runner
export { AgentRunner } from './runner';
export type { AgentContext, AgentRunResult, Decision, DecisionAction } from './runner';

// Decision Engine
export { DecisionEngine, addCustomRule, getSkillRules } from './decision-engine';

// Individual agent definitions
export {
  ceoAgent,
  cfoAgent,
  cooAgent,
  ctoAgent,
  hrManagerAgent,
  csManagerAgent,
  analystAgent,
  auditorAgent,
} from './definitions';
