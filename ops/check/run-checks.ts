/**
 * ops/check/run-checks.ts
 *
 * システムチェックを実行し、結果をJSONで保存する
 * - npm run self-check の実行
 * - skill-deprecation-check の実行
 */

import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// 環境変数またはハードコード（本番では環境変数推奨）
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zjjmeebcbdvnsddeodib.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TENANT_ID = process.env.TENANT_ID || '1542976a-8814-4019-a65b-c434ccf092bf';

interface SelfCheckResult {
  success: boolean;
  duration_ms: number;
  stdout_summary: string;
  error?: string;
  checks?: {
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message?: string;
  }[];
}

interface DeprecationCheckResult {
  success: boolean;
  skipped?: boolean;
  skip_reason?: string;
  duration_ms: number;
  total_skills_checked: number;
  deprecation_candidates: number;
  healthy_skills_count: number;
  candidates: {
    skill_key: string;
    skill_name: string;
    reasons: string[];
    recommended_action: string;
  }[];
  error?: string;
}

interface RunReport {
  timestamp: string;
  self_check: SelfCheckResult;
  deprecation_check: DeprecationCheckResult;
  summary: {
    total_issues: number;
    critical_issues: number;
    warnings: number;
  };
}

/**
 * self-check を実行
 */
function runSelfCheck(): SelfCheckResult {
  const startTime = Date.now();

  try {
    const stdout = execSync('npm run self-check', {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const duration = Date.now() - startTime;

    // stdout から要約を抽出（最大500文字）
    const lines = stdout.split('\n').filter(l => l.trim());
    const summary = lines.slice(-20).join('\n').slice(0, 500);

    // チェック結果をパース
    const checks = parseChecks(stdout);

    // 成功判定: checks があれば fail がないこと、なければ stdout に error/fail パターンがないこと
    const hasFailedCheck = checks?.some(c => c.status === 'fail') ?? false;
    // "0 failed" は成功扱い、それ以外の "N failed" (N>0) や "error:" はエラー
    const hasActualFailure = /[1-9]\d*\s*failed|\berror:/i.test(stdout);
    const success = !hasFailedCheck && !hasActualFailure;

    return {
      success,
      duration_ms: duration,
      stdout_summary: summary,
      checks,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      duration_ms: duration,
      stdout_summary: error.stdout?.slice(0, 500) || '',
      error: error.message?.slice(0, 200) || 'Unknown error',
    };
  }
}

/**
 * stdout からチェック結果をパース（簡易）
 */
function parseChecks(stdout: string): SelfCheckResult['checks'] {
  const checks: SelfCheckResult['checks'] = [];
  const lines = stdout.split('\n');

  for (const line of lines) {
    if (line.includes('✓') || line.includes('PASS') || line.includes('OK')) {
      const name = line.replace(/[✓✔]/g, '').trim().slice(0, 50);
      if (name) checks.push({ name, status: 'pass' });
    } else if (line.includes('✗') || line.includes('FAIL') || line.includes('ERROR')) {
      const name = line.replace(/[✗✘]/g, '').trim().slice(0, 50);
      if (name) checks.push({ name, status: 'fail', message: line.slice(0, 100) });
    } else if (line.includes('⚠') || line.includes('WARN')) {
      const name = line.replace(/[⚠]/g, '').trim().slice(0, 50);
      if (name) checks.push({ name, status: 'warn', message: line.slice(0, 100) });
    }
  }

  return checks.length > 0 ? checks : undefined;
}

/**
 * skill-deprecation-check を実行
 */
async function runDeprecationCheck(): Promise<DeprecationCheckResult> {
  const startTime = Date.now();

  if (!SUPABASE_SERVICE_KEY) {
    return {
      success: true,
      skipped: true,
      skip_reason: 'SUPABASE_SERVICE_ROLE_KEY not set',
      duration_ms: Date.now() - startTime,
      total_skills_checked: 0,
      deprecation_candidates: 0,
      healthy_skills_count: 0,
      candidates: [],
    };
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // スキル一覧取得
    const { data: skills, error: skillsError } = await db
      .from('skills')
      .select('id, key, name')
      .eq('tenant_id', TENANT_ID)
      .eq('is_active', true);

    if (skillsError) throw skillsError;

    const candidates: DeprecationCheckResult['candidates'] = [];
    let healthyCount = 0;

    for (const skill of skills || []) {
      const { data: executions } = await db
        .from('skill_executions')
        .select('id, state, created_at')
        .eq('tenant_id', TENANT_ID)
        .eq('skill_id', skill.id)
        .gte('created_at', periodStart.toISOString());

      const execs = executions || [];
      const total = execs.length;
      const completed = execs.filter((e: any) => e.state === 'COMPLETED').length;
      const successRate = total > 0 ? completed / total : 1;

      // 最終使用日
      const sortedExecs = [...execs].sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const lastUsedAt = sortedExecs[0]?.created_at;
      const daysSinceLastUse = lastUsedAt
        ? Math.floor((now.getTime() - new Date(lastUsedAt).getTime()) / (24 * 60 * 60 * 1000))
        : 999;

      const reasons: string[] = [];

      // 90日以上未使用
      if (daysSinceLastUse > 90) {
        reasons.push(`${daysSinceLastUse}日間未使用`);
      }

      // エラー率30%以上（10回以上実行時）
      if ((1 - successRate) > 0.3 && total >= 10) {
        reasons.push(`エラー率${((1 - successRate) * 100).toFixed(1)}%`);
      }

      if (reasons.length > 0) {
        candidates.push({
          skill_key: skill.key,
          skill_name: skill.name,
          reasons,
          recommended_action: daysSinceLastUse > 180 ? 'deprecate' : 'monitor',
        });
      } else {
        healthyCount++;
      }
    }

    return {
      success: true,
      duration_ms: Date.now() - startTime,
      total_skills_checked: skills?.length || 0,
      deprecation_candidates: candidates.length,
      healthy_skills_count: healthyCount,
      candidates,
    };
  } catch (error: any) {
    return {
      success: false,
      duration_ms: Date.now() - startTime,
      total_skills_checked: 0,
      deprecation_candidates: 0,
      healthy_skills_count: 0,
      candidates: [],
      error: error.message?.slice(0, 200) || 'Unknown error',
    };
  }
}

/**
 * メイン実行
 */
async function main() {
  console.log('=== ops:check 実行開始 ===\n');

  // 1. self-check 実行
  console.log('1. npm run self-check を実行中...');
  const selfCheckResult = runSelfCheck();
  console.log(`   完了: ${selfCheckResult.success ? '成功' : '失敗'} (${selfCheckResult.duration_ms}ms)`);

  // 2. deprecation-check 実行
  console.log('2. skill-deprecation-check を実行中...');
  const deprecationResult = await runDeprecationCheck();
  const deprecationStatus = deprecationResult.skipped
    ? `スキップ (${deprecationResult.skip_reason})`
    : deprecationResult.success ? '成功' : '失敗';
  console.log(`   完了: ${deprecationStatus} (${deprecationResult.duration_ms}ms)`);

  // 3. サマリー計算
  const criticalIssues =
    (selfCheckResult.checks?.filter(c => c.status === 'fail').length || 0) +
    (deprecationResult.candidates.filter(c => c.recommended_action === 'deprecate').length);

  const warnings =
    (selfCheckResult.checks?.filter(c => c.status === 'warn').length || 0) +
    (deprecationResult.candidates.filter(c => c.recommended_action === 'monitor').length);

  // 4. レポート生成
  const report: RunReport = {
    timestamp: new Date().toISOString(),
    self_check: selfCheckResult,
    deprecation_check: deprecationResult,
    summary: {
      total_issues: criticalIssues + warnings,
      critical_issues: criticalIssues,
      warnings,
    },
  };

  // 5. ディレクトリ作成・保存
  const reportsDir = path.resolve(__dirname, '../reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const runJsonPath = path.join(reportsDir, 'run.json');
  const latestJsonPath = path.join(reportsDir, 'latest.json');

  // 現在のrun.jsonをlatest.jsonとして保存（存在する場合）
  if (fs.existsSync(runJsonPath)) {
    const previousRun = fs.readFileSync(runJsonPath, 'utf-8');
    fs.writeFileSync(latestJsonPath, previousRun);
  }

  // 新しいrun.jsonを保存
  fs.writeFileSync(runJsonPath, JSON.stringify(report, null, 2));

  console.log('\n=== 結果 ===');
  console.log(`保存先: ${runJsonPath}`);
  console.log(`問題数: ${report.summary.total_issues} (Critical: ${report.summary.critical_issues}, Warn: ${report.summary.warnings})`);
  console.log('\n=== ops:check 完了 ===');
}

main().catch(console.error);
