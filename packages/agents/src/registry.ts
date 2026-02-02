/**
 * Agent Registry
 *
 * エージェントの登録と検索を管理
 */

import { allAgents, organizationChart } from './definitions';
import type { AgentSpec, AgentRole, Department, AgentCapability } from './types';

class AgentRegistry {
  private agents: Map<string, AgentSpec> = new Map();
  private byRole: Map<AgentRole, AgentSpec[]> = new Map();
  private byDepartment: Map<Department, AgentSpec[]> = new Map();
  private byCapability: Map<AgentCapability, AgentSpec[]> = new Map();

  constructor() {
    this.loadAgents();
  }

  private loadAgents(): void {
    for (const agent of allAgents) {
      this.agents.set(agent.key, agent);

      // Index by role
      const roleAgents = this.byRole.get(agent.role) || [];
      roleAgents.push(agent);
      this.byRole.set(agent.role, roleAgents);

      // Index by department
      const deptAgents = this.byDepartment.get(agent.department) || [];
      deptAgents.push(agent);
      this.byDepartment.set(agent.department, deptAgents);

      // Index by capability
      for (const cap of agent.capabilities) {
        const capAgents = this.byCapability.get(cap) || [];
        capAgents.push(agent);
        this.byCapability.set(cap, capAgents);
      }
    }
  }

  /**
   * Get agent by key
   */
  get(key: string): AgentSpec | undefined {
    return this.agents.get(key);
  }

  /**
   * Get all agents
   */
  getAll(): AgentSpec[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by role
   */
  getByRole(role: AgentRole): AgentSpec[] {
    return this.byRole.get(role) || [];
  }

  /**
   * Get agents by department
   */
  getByDepartment(department: Department): AgentSpec[] {
    return this.byDepartment.get(department) || [];
  }

  /**
   * Get agents with specific capability
   */
  getByCapability(capability: AgentCapability): AgentSpec[] {
    return this.byCapability.get(capability) || [];
  }

  /**
   * Get agents that can execute a specific skill
   */
  getByAllowedSkill(skillKey: string): AgentSpec[] {
    return this.getAll().filter(agent =>
      agent.allowed_skills.includes(skillKey) ||
      agent.allowed_skills.includes('*')
    );
  }

  /**
   * Get the supervisor of an agent
   */
  getSupervisor(agentKey: string): AgentSpec | undefined {
    const agent = this.get(agentKey);
    if (!agent || !agent.reports_to) return undefined;
    return this.get(agent.reports_to);
  }

  /**
   * Get direct reports of an agent
   */
  getDirectReports(agentKey: string): AgentSpec[] {
    return this.getAll().filter(agent => agent.reports_to === agentKey);
  }

  /**
   * Get the escalation chain for an agent (up to CEO)
   */
  getEscalationChain(agentKey: string): AgentSpec[] {
    const chain: AgentSpec[] = [];
    let current = this.get(agentKey);

    while (current && current.reports_to) {
      const supervisor = this.get(current.reports_to);
      if (supervisor) {
        chain.push(supervisor);
        current = supervisor;
      } else {
        break;
      }
    }

    return chain;
  }

  /**
   * Find the best agent for a task based on capabilities and skill
   */
  findBestAgentForSkill(skillKey: string): AgentSpec | undefined {
    const candidates = this.getByAllowedSkill(skillKey);

    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0];

    // Prefer agents with higher responsibility level (more autonomous)
    // but lower in hierarchy (more specialized)
    return candidates.sort((a, b) => {
      // Higher responsibility level = can act more autonomously
      if (a.max_responsibility_level !== b.max_responsibility_level) {
        return b.max_responsibility_level - a.max_responsibility_level;
      }
      // If same level, prefer the one with fewer allowed skills (more specialized)
      return a.allowed_skills.length - b.allowed_skills.length;
    })[0];
  }

  /**
   * Get scheduled tasks for all agents
   */
  getAllScheduledTasks(): Array<{
    agent: AgentSpec;
    task: AgentSpec['scheduled_tasks'][0];
  }> {
    const tasks: Array<{ agent: AgentSpec; task: AgentSpec['scheduled_tasks'][0] }> = [];

    for (const agent of this.getAll()) {
      for (const task of agent.scheduled_tasks) {
        tasks.push({ agent, task });
      }
    }

    return tasks;
  }

  /**
   * Get event triggers for all agents
   */
  getAllEventTriggers(): Array<{
    agent: AgentSpec;
    trigger: AgentSpec['event_triggers'][0];
  }> {
    const triggers: Array<{ agent: AgentSpec; trigger: AgentSpec['event_triggers'][0] }> = [];

    for (const agent of this.getAll()) {
      for (const trigger of agent.event_triggers) {
        triggers.push({ agent, trigger });
      }
    }

    return triggers;
  }

  /**
   * Get agents that should be triggered by an event
   */
  getAgentsForEvent(eventType: string): Array<{
    agent: AgentSpec;
    trigger: AgentSpec['event_triggers'][0];
  }> {
    return this.getAllEventTriggers().filter(
      ({ trigger }) => trigger.event_type === eventType
    );
  }

  /**
   * Get organization chart
   */
  getOrganizationChart() {
    return organizationChart;
  }

  /**
   * Validate agent configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const agent of this.getAll()) {
      // Check reports_to exists
      if (agent.reports_to && !this.get(agent.reports_to)) {
        errors.push(`Agent ${agent.key}: reports_to "${agent.reports_to}" not found`);
      }

      // Check for circular reporting
      const chain = this.getEscalationChain(agent.key);
      if (chain.some(a => a.key === agent.key)) {
        errors.push(`Agent ${agent.key}: circular reporting chain detected`);
      }

      // Check scheduled task skill references
      for (const task of agent.scheduled_tasks) {
        if (!agent.allowed_skills.includes(task.skill_key) &&
            !agent.allowed_skills.includes('*')) {
          errors.push(
            `Agent ${agent.key}: scheduled task uses skill "${task.skill_key}" not in allowed_skills`
          );
        }
      }

      // Check event trigger skill references
      for (const trigger of agent.event_triggers) {
        if (!agent.allowed_skills.includes(trigger.skill_key) &&
            !agent.allowed_skills.includes('*')) {
          errors.push(
            `Agent ${agent.key}: event trigger uses skill "${trigger.skill_key}" not in allowed_skills`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Singleton instance
export const agentRegistry = new AgentRegistry();

// Export class for type usage
export { AgentRegistry };

// Re-export for convenience
export { allAgents, organizationChart };
