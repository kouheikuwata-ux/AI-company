/**
 * Agent Runner - エージェント実行エンジン
 *
 * ルールベースでエージェントに判断能力を持たせる（LLM不要）
 */

import type { AgentSpec, ScheduledTask, EventTrigger } from './types';
import type { SkillResult } from '@ai-company-os/skill-spec';
import { DecisionEngine, type Decision, type DecisionAction } from './decision-engine';

/**
 * エージェント実行コンテキスト
 */
export interface AgentContext {
  tenantId: string;
  traceId: string;
  legalResponsibleUserId: string;
  executeSkill: (skillKey: string, input: Record<string, unknown>) => Promise<SkillResult>;
}

/**
 * エージェント実行結果
 */
export interface AgentRunResult {
  agentId: string;
  taskKey: string;
  decisions: Decision[];
  actionsExecuted: DecisionAction[];
  skillResults: SkillResult[];
  finalSummary: string;
  totalCost: number;
}

/**
 * エージェントランナー
 *
 * エージェントの判断ループを管理：
 * 1. 初期スキル実行
 * 2. 結果をルールエンジンで分析
 * 3. 次のアクションを決定
 * 4. 必要に応じて追加スキル実行
 * 5. 最終サマリー生成
 */
export class AgentRunner {
  private agent: AgentSpec;
  private context: AgentContext;
  private decisionEngine: DecisionEngine;
  private maxIterations: number = 3; // 無限ループ防止

  constructor(agent: AgentSpec, context: AgentContext) {
    this.agent = agent;
    this.context = context;
    this.decisionEngine = new DecisionEngine(agent);
  }

  /**
   * スケジュールタスクを実行
   */
  async runScheduledTask(task: ScheduledTask): Promise<AgentRunResult> {
    const decisions: Decision[] = [];
    const actionsExecuted: DecisionAction[] = [];
    const skillResults: SkillResult[] = [];
    let totalCost = 0;

    console.log(`[${this.agent.name}] タスク開始: ${task.task_key}`);

    // 1. 初期スキル実行
    const initialResult = await this.context.executeSkill(
      task.skill_key,
      task.default_input || {}
    );
    skillResults.push(initialResult);
    totalCost += initialResult.actual_cost;

    console.log(`[${this.agent.name}] スキル実行完了: ${task.skill_key}`);

    // 2. 結果を分析して判断ループ
    let iteration = 0;
    let currentSkillKey = task.skill_key;
    let currentResult = initialResult;

    while (iteration < this.maxIterations) {
      iteration++;

      // ルールエンジンで分析
      const decision = this.decisionEngine.analyze(currentSkillKey, currentResult);
      decisions.push(decision);

      console.log(`[${this.agent.name}] 判断 #${iteration}: ${decision.severity} - ${decision.analysis}`);

      // アクション不要なら終了
      if (!decision.shouldTakeAction || decision.actions.length === 0) {
        console.log(`[${this.agent.name}] 追加アクション不要。ループ終了。`);
        break;
      }

      // アクションを実行
      let executedSkill = false;
      for (const action of decision.actions) {
        actionsExecuted.push(action);
        console.log(`[${this.agent.name}] アクション実行: [${action.type}] ${action.message}`);

        if (action.type === 'execute_skill' && action.skillKey) {
          // スキルが許可されているか確認
          if (!this.agent.allowed_skills.includes(action.skillKey)) {
            console.log(`[${this.agent.name}] スキル ${action.skillKey} は許可されていません`);
            continue;
          }

          try {
            const result = await this.context.executeSkill(
              action.skillKey,
              action.input || {}
            );
            skillResults.push(result);
            totalCost += result.actual_cost;
            currentSkillKey = action.skillKey;
            currentResult = result;
            executedSkill = true;

            console.log(`[${this.agent.name}] 追加スキル実行完了: ${action.skillKey}`);
          } catch (error) {
            console.error(`[${this.agent.name}] スキル実行エラー: ${action.skillKey}`, error);
          }
        }
      }

      // 追加スキルが実行されなかった場合はループ終了
      if (!executedSkill) {
        break;
      }
    }

    // 3. 最終サマリー生成
    const finalDecision = decisions[decisions.length - 1];
    const finalSummary = this.decisionEngine.generateSummary(task, finalDecision, skillResults);

    console.log(`[${this.agent.name}] タスク完了: ${task.task_key}`);

    return {
      agentId: this.agent.id,
      taskKey: task.task_key,
      decisions,
      actionsExecuted,
      skillResults,
      finalSummary,
      totalCost,
    };
  }

  /**
   * イベントトリガーを実行
   */
  async runEventTrigger(
    trigger: EventTrigger,
    eventData: Record<string, unknown>
  ): Promise<AgentRunResult> {
    const decisions: Decision[] = [];
    const actionsExecuted: DecisionAction[] = [];
    const skillResults: SkillResult[] = [];
    let totalCost = 0;

    console.log(`[${this.agent.name}] イベント処理: ${trigger.event_type}`);

    // イベントデータをスキル入力にマージ
    const input = {
      ...(trigger.default_input || {}),
      _event: eventData,
    };

    // スキル実行
    const result = await this.context.executeSkill(trigger.skill_key, input);
    skillResults.push(result);
    totalCost += result.actual_cost;

    // イベントを考慮した分析
    const decision = this.decisionEngine.analyzeEvent(trigger, eventData, result);
    decisions.push(decision);

    // 追加アクション実行
    for (const action of decision.actions) {
      actionsExecuted.push(action);

      if (action.type === 'execute_skill' && action.skillKey) {
        if (!this.agent.allowed_skills.includes(action.skillKey)) continue;

        try {
          const additionalResult = await this.context.executeSkill(
            action.skillKey,
            action.input || {}
          );
          skillResults.push(additionalResult);
          totalCost += additionalResult.actual_cost;
        } catch (error) {
          console.error(`[${this.agent.name}] スキル実行エラー:`, error);
        }
      }
    }

    const finalSummary = `[${this.agent.name}] イベント「${trigger.event_type}」処理完了。${decision.analysis}`;

    return {
      agentId: this.agent.id,
      taskKey: trigger.event_type,
      decisions,
      actionsExecuted,
      skillResults,
      finalSummary,
      totalCost,
    };
  }
}

// Re-export types from decision-engine
export type { Decision, DecisionAction } from './decision-engine';
