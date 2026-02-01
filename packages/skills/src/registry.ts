import { z } from 'zod';
import type {
  SkillSpec,
  SkillHandler,
  SkillResult,
  SkillContext,
} from '@ai-company-os/skill-spec';
import { ResponsibilityLevel } from '@ai-company-os/skill-spec';

/**
 * 入力検証結果
 */
export interface ValidationResult {
  success: boolean;
  errors?: unknown[];
}

/**
 * 登録済みスキル
 */
export class RegisteredSkill {
  constructor(
    public readonly spec: SkillSpec,
    private readonly handler: SkillHandler,
    private readonly inputSchema?: z.ZodSchema
  ) {}

  /**
   * 推定コスト計算
   */
  get estimatedCost(): number {
    const cm = this.spec.cost_model;
    return (
      cm.fixed_cost +
      ((cm.estimated_tokens_input ?? 0) / 1000) * cm.per_token_input +
      ((cm.estimated_tokens_output ?? 0) / 1000) * cm.per_token_output
    );
  }

  /**
   * 入力検証
   */
  validateInput(input: unknown): ValidationResult {
    if (!this.inputSchema) {
      return { success: true };
    }

    const result = this.inputSchema.safeParse(input);
    if (result.success) {
      return { success: true };
    }

    return {
      success: false,
      errors: result.error.errors,
    };
  }

  /**
   * 承認が必要かチェック
   */
  requiresApproval(responsibilityLevel: ResponsibilityLevel): boolean {
    // 明示的に承認必須の場合
    if (this.spec.safety.requires_approval) {
      return true;
    }

    // 責任レベルが不足している場合
    if (responsibilityLevel > this.spec.required_responsibility_level) {
      return true;
    }

    return false;
  }

  /**
   * スキル実行
   */
  async execute(input: Record<string, unknown>, context: SkillContext): Promise<SkillResult> {
    return this.handler(input, context);
  }
}

/**
 * スキルレジストリ
 */
export class SkillRegistry {
  private handlers = new Map<string, RegisteredSkill>();
  private specs = new Map<string, SkillSpec>();

  /**
   * スキル登録
   */
  register(spec: SkillSpec, handler: SkillHandler, inputSchema?: z.ZodSchema): void {
    const key = `${spec.key}@${spec.version}`;
    const registeredSkill = new RegisteredSkill(spec, handler, inputSchema);

    this.handlers.set(key, registeredSkill);
    this.specs.set(key, spec);

    // latest版も登録
    const latestKey = `${spec.key}@latest`;
    this.handlers.set(latestKey, registeredSkill);
    this.specs.set(latestKey, spec);
  }

  /**
   * スキル取得
   */
  get(skillKey: string, version: string = 'latest'): RegisteredSkill | null {
    const key = `${skillKey}@${version}`;
    return this.handlers.get(key) || null;
  }

  /**
   * スキル一覧取得（重複排除）
   */
  list(): SkillSpec[] {
    // Map のキーから @latest を除外し、ユニークなスキルのみ返す
    const uniqueSpecs = new Map<string, SkillSpec>();
    for (const [mapKey, spec] of this.specs.entries()) {
      // @latest エントリは除外（バージョン付きエントリのみ採用）
      if (!mapKey.endsWith('@latest')) {
        uniqueSpecs.set(spec.key, spec);
      }
    }
    return Array.from(uniqueSpecs.values());
  }

  /**
   * スキルキー一覧取得
   */
  keys(): string[] {
    return Array.from(
      new Set(Array.from(this.specs.keys()).map((k) => k.split('@')[0]))
    );
  }

  /**
   * スキルが存在するかチェック
   */
  has(skillKey: string, version: string = 'latest'): boolean {
    const key = `${skillKey}@${version}`;
    return this.handlers.has(key);
  }

  /**
   * スキル数取得
   */
  get size(): number {
    return this.keys().length;
  }
}
