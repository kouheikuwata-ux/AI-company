import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * 診断設定定数
 */
export const DIAGNOSIS_CONFIG = {
  /** 最小必要スキル数 */
  MIN_SKILL_COUNT: 4,
  /** 最小Node.jsメジャーバージョン */
  MIN_NODE_MAJOR_VERSION: 20,
  /** TypeScriptチェックのタイムアウト (ms) */
  TYPECHECK_TIMEOUT_MS: 60000,
  /** デフォルトシステムバージョン */
  DEFAULT_VERSION: '0.0.0' as string,
  /** 必須環境変数 */
  REQUIRED_ENV_VARS: [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'INNGEST_EVENT_KEY',
    'ANTHROPIC_API_KEY',
  ] as const,
  /** スキルカテゴリ */
  SKILL_CATEGORIES: ['governance', 'internal'] as const,
  /** 内部スキルカテゴリ名 */
  INTERNAL_CATEGORY: 'internal',
} as const;

/**
 * チェック結果アイテム
 */
export interface CheckResultItem {
  category: string;
  check: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
}

/**
 * 診断結果
 */
export interface DiagnosisResult {
  issues_total: number;
  issues_auto_fixed: number;
  issues_pending_approval: number;
  summary: CheckResultItem[];
  full_report: {
    started_at: string;
    completed_at: string;
    duration_ms: number;
    environment: {
      node_version: string;
      platform: string;
      cwd: string;
    };
    totals: {
      passed: number;
      failed: number;
      warnings: number;
    };
  };
  system_version: string;
}

/**
 * 診断オプション
 */
export interface DiagnosisOptions {
  full?: boolean;
  basePath?: string;
}

/**
 * 診断実行クラス（状態を内包）
 */
class SelfCheckRunner {
  private passCount = 0;
  private failCount = 0;
  private warnCount = 0;
  private checkResults: CheckResultItem[] = [];
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  private fileExists(filePath: string): boolean {
    return fs.existsSync(path.resolve(this.basePath, filePath));
  }

  private readJson(filePath: string): Record<string, unknown> {
    const fullPath = path.resolve(this.basePath, filePath);
    return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  }

  private exec(cmd: string, options: Record<string, unknown> = {}): string {
    return execSync(cmd, {
      cwd: this.basePath,
      encoding: 'utf-8',
      stdio: 'pipe',
      ...options,
    }) as string;
  }

  private check(name: string, fn: () => boolean | string | { warn: boolean; message?: string }, category: string): boolean {
    try {
      const result = fn();
      if (result === true || result === 'pass') {
        this.passCount++;
        this.checkResults.push({ category, check: name, status: 'pass' });
        return true;
      } else if (result === 'warn' || (typeof result === 'object' && result.warn)) {
        const msg = typeof result === 'object' ? result.message || '' : '';
        this.warnCount++;
        this.checkResults.push({ category, check: name, status: 'warn', message: msg });
        return true;
      } else {
        const msg = typeof result === 'string' ? result : '';
        this.failCount++;
        this.checkResults.push({ category, check: name, status: 'fail', message: msg });
        return false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.failCount++;
      this.checkResults.push({ category, check: name, status: 'fail', message });
      return false;
    }
  }

  private checkProjectStructure(): void {
    const cat = 'structure';
    this.check('Root package.json exists', () => this.fileExists('package.json'), cat);
    this.check('pnpm-workspace.yaml exists', () => this.fileExists('pnpm-workspace.yaml'), cat);
    this.check('turbo.json exists', () => this.fileExists('turbo.json'), cat);
    this.check('packages/skill-spec exists', () => this.fileExists('packages/skill-spec/package.json'), cat);
    this.check('packages/database exists', () => this.fileExists('packages/database/package.json'), cat);
    this.check('packages/runner exists', () => this.fileExists('packages/runner/package.json'), cat);
    this.check('packages/skills exists', () => this.fileExists('packages/skills/package.json'), cat);
    this.check('apps/web exists', () => this.fileExists('apps/web/package.json'), cat);
  }

  private checkDependencies(): void {
    const cat = 'dependencies';
    this.check('node_modules installed', () => this.fileExists('node_modules'), cat);
    this.check(`Node.js version >= ${DIAGNOSIS_CONFIG.MIN_NODE_MAJOR_VERSION}`, () => {
      const version = process.version;
      const major = parseInt(version.slice(1).split('.')[0], 10);
      if (major >= DIAGNOSIS_CONFIG.MIN_NODE_MAJOR_VERSION) return true;
      return `Current: ${version}`;
    }, cat);
    this.check('pnpm available', () => {
      try {
        this.exec('pnpm --version');
        return true;
      } catch {
        return 'pnpm not found';
      }
    }, cat);
  }

  private checkBuild(): void {
    const cat = 'build';
    this.check('skill-spec dist exists', () => this.fileExists('packages/skill-spec/dist/index.js'), cat);
    this.check('database dist exists', () => this.fileExists('packages/database/dist/index.js'), cat);
    this.check('runner dist exists', () => this.fileExists('packages/runner/dist/index.js'), cat);
    this.check('skills dist exists', () => this.fileExists('packages/skills/dist/index.js'), cat);
    this.check('web .next exists', () => this.fileExists('apps/web/.next'), cat);
  }

  private checkSkillRegistry(): void {
    const cat = 'registry';
    this.check('Generated registry exists', () =>
      this.fileExists('packages/skills/src/generated/skill-registry.ts'), cat);

    for (const categoryName of DIAGNOSIS_CONFIG.SKILL_CATEGORIES) {
      const categoryPath = `packages/skills/src/${categoryName}`;
      this.check(`${categoryName}/ category exists`, () => {
        if (!this.fileExists(categoryPath)) return `Missing: ${categoryPath}`;
        return true;
      }, cat);
    }

    this.check(`Registry has >= ${DIAGNOSIS_CONFIG.MIN_SKILL_COUNT} skills`, () => {
      const registryPath = path.resolve(this.basePath, 'packages/skills/src/generated/skill-registry.ts');
      if (!fs.existsSync(registryPath)) return 'Registry file not found';

      const content = fs.readFileSync(registryPath, 'utf-8');
      const totalMatch = content.match(/Total skills:\s*(\d+)/);
      if (totalMatch) {
        const count = parseInt(totalMatch[1], 10);
        if (count >= DIAGNOSIS_CONFIG.MIN_SKILL_COUNT) return true;
        return `Only ${count} skills found (expected >= ${DIAGNOSIS_CONFIG.MIN_SKILL_COUNT})`;
      }

      const registerCalls = content.match(/registry\.register\(/g) || [];
      const count = registerCalls.length;
      if (count >= DIAGNOSIS_CONFIG.MIN_SKILL_COUNT) return true;
      return `Only ${count} skills found (expected >= ${DIAGNOSIS_CONFIG.MIN_SKILL_COUNT})`;
    }, cat);
  }

  private checkInternalSkillProtection(): void {
    const cat = 'security';
    const internalCheck = `category === '${DIAGNOSIS_CONFIG.INTERNAL_CATEGORY}'`;
    const internalFilter = `category !== '${DIAGNOSIS_CONFIG.INTERNAL_CATEGORY}'`;

    this.check('API execute route has internal check', () => {
      const routePath = 'apps/web/src/app/api/skills/[key]/execute/route.ts';
      if (!this.fileExists(routePath)) return 'File not found';
      const content = fs.readFileSync(path.resolve(this.basePath, routePath), 'utf-8');
      if (!content.includes(internalCheck)) return 'Missing internal category check';
      if (!content.includes('403')) return 'Missing 403 response';
      return true;
    }, cat);

    this.check('Inngest handler has internal check', () => {
      const handlerPath = 'apps/web/src/lib/inngest/functions/skill-execute.ts';
      if (!this.fileExists(handlerPath)) return 'File not found';
      const content = fs.readFileSync(path.resolve(this.basePath, handlerPath), 'utf-8');
      if (!content.includes(internalCheck)) return 'Missing internal category check';
      if (!content.includes('parent_execution_id')) return 'Missing parent_execution_id check';
      if (!content.includes('INTERNAL_SKILL_BLOCKED')) return 'Missing blocked error code';
      if (!content.includes('auditLogger.log')) return 'Missing audit logging';
      return true;
    }, cat);

    this.check('Skills list API excludes internal', () => {
      const apiPath = 'apps/web/src/app/api/skills/route.ts';
      if (!this.fileExists(apiPath)) return 'File not found';
      const content = fs.readFileSync(path.resolve(this.basePath, apiPath), 'utf-8');
      if (!content.includes(internalFilter)) return 'Missing internal filter';
      return true;
    }, cat);
  }

  private checkEnvironmentConfig(): void {
    const cat = 'environment';
    this.check('.env.example exists', () => this.fileExists('apps/web/.env.example'), cat);
    this.check('.env.local configured', () => {
      if (this.fileExists('apps/web/.env.local')) return true;
      return { warn: true, message: 'Create from .env.example' };
    }, cat);
    this.check('.env.example has required vars', () => {
      const examplePath = 'apps/web/.env.example';
      if (!this.fileExists(examplePath)) return 'File not found';
      const content = fs.readFileSync(path.resolve(this.basePath, examplePath), 'utf-8');
      const missing = DIAGNOSIS_CONFIG.REQUIRED_ENV_VARS.filter(v => !content.includes(v));
      if (missing.length > 0) return `Missing: ${missing.join(', ')}`;
      return true;
    }, cat);
  }

  private checkTypeScript(): void {
    const cat = 'typescript';
    this.check('Type check passes', () => {
      try {
        this.exec('pnpm type-check', { timeout: DIAGNOSIS_CONFIG.TYPECHECK_TIMEOUT_MS });
        return true;
      } catch {
        return 'Type errors found';
      }
    }, cat);
  }

  /**
   * 診断実行
   */
  run(options: DiagnosisOptions = {}): DiagnosisResult {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    // 全チェック実行
    this.checkProjectStructure();
    this.checkDependencies();
    this.checkBuild();
    this.checkSkillRegistry();
    this.checkInternalSkillProtection();
    this.checkEnvironmentConfig();

    if (options.full) {
      this.checkTypeScript();
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    // system_version 取得
    let systemVersion = DIAGNOSIS_CONFIG.DEFAULT_VERSION;
    try {
      const pkg = this.readJson('package.json') as { version?: string };
      systemVersion = pkg.version || DIAGNOSIS_CONFIG.DEFAULT_VERSION;
    } catch {
      // ignore
    }

    return {
      issues_total: this.failCount + this.warnCount,
      issues_auto_fixed: 0,
      issues_pending_approval: this.failCount,
      summary: this.checkResults,
      full_report: {
        started_at: startedAt,
        completed_at: completedAt,
        duration_ms: durationMs,
        environment: {
          node_version: process.version,
          platform: process.platform,
          cwd: this.basePath,
        },
        totals: {
          passed: this.passCount,
          failed: this.failCount,
          warnings: this.warnCount,
        },
      },
      system_version: systemVersion,
    };
  }
}

/**
 * Self-Check を実行して結果を返す
 *
 * @param options.full - TypeScript型チェックを含める
 * @param options.basePath - プロジェクトルートパス（デフォルト: process.cwd()）
 */
export function runSelfCheck(options: DiagnosisOptions = {}): DiagnosisResult {
  const basePath = options.basePath || process.cwd();
  const runner = new SelfCheckRunner(basePath);
  return runner.run(options);
}
