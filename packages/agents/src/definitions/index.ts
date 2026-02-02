/**
 * AI Company OS - Agent Definitions
 *
 * 会社の組織図をコードで表現
 * 各エージェントは特定の役割と責任を持つ
 */

export { ceoAgent } from './ceo.agent';
export { cfoAgent } from './cfo.agent';
export { cooAgent } from './coo.agent';
export { ctoAgent } from './cto.agent';
export { hrManagerAgent } from './hr-manager.agent';
export { csManagerAgent } from './cs-manager.agent';
export { analystAgent } from './analyst.agent';
export { auditorAgent } from './auditor.agent';

import { ceoAgent } from './ceo.agent';
import { cfoAgent } from './cfo.agent';
import { cooAgent } from './coo.agent';
import { ctoAgent } from './cto.agent';
import { hrManagerAgent } from './hr-manager.agent';
import { csManagerAgent } from './cs-manager.agent';
import { analystAgent } from './analyst.agent';
import { auditorAgent } from './auditor.agent';
import type { AgentSpec } from '../types';

// Organization Chart (組織図)
export const organizationChart = {
  ceo: {
    agent: ceoAgent,
    reports: ['cfo', 'coo', 'cto'],
  },
  cfo: {
    agent: cfoAgent,
    reports: ['analyst'],
  },
  coo: {
    agent: cooAgent,
    reports: ['hr-manager', 'cs-manager'],
  },
  cto: {
    agent: ctoAgent,
    reports: ['auditor'],
  },
  'hr-manager': {
    agent: hrManagerAgent,
    reports: [],
  },
  'cs-manager': {
    agent: csManagerAgent,
    reports: [],
  },
  analyst: {
    agent: analystAgent,
    reports: [],
  },
  auditor: {
    agent: auditorAgent,
    reports: [],
  },
} as const;

// All agents as array
export const allAgents: AgentSpec[] = [
  ceoAgent,
  cfoAgent,
  cooAgent,
  ctoAgent,
  hrManagerAgent,
  csManagerAgent,
  analystAgent,
  auditorAgent,
];
