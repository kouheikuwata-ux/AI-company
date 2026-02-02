/**
 * ops/report/summarize.ts
 *
 * run.json を読み込み、P0/P1/P2 に分類してサマリーを出力する
 * - latest.json との比較で regression を検出
 * - 改善提案を出力
 */

import * as fs from 'fs';
import * as path from 'path';

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

interface Issue {
  priority: 'P0' | 'P1' | 'P2';
  category: string;
  title: string;
  description: string;
  recommendation: string;
  is_regression?: boolean;
}

interface SummaryReport {
  generated_at: string;
  run_timestamp: string;
  issues: {
    P0: Issue[];
    P1: Issue[];
    P2: Issue[];
  };
  regressions: Issue[];
  improvements: Issue[];
  overall_health: 'critical' | 'warning' | 'healthy';
  next_actions: string[];
}

/**
 * run.json を読み込む
 */
function loadRunReport(reportsDir: string): RunReport | null {
  const runJsonPath = path.join(reportsDir, 'run.json');
  if (!fs.existsSync(runJsonPath)) {
    console.error(`Error: ${runJsonPath} not found. Run 'npm run ops:check' first.`);
    return null;
  }
  return JSON.parse(fs.readFileSync(runJsonPath, 'utf-8'));
}

/**
 * latest.json を読み込む（存在しない場合は null）
 */
function loadLatestReport(reportsDir: string): RunReport | null {
  const latestJsonPath = path.join(reportsDir, 'latest.json');
  if (!fs.existsSync(latestJsonPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(latestJsonPath, 'utf-8'));
}

/**
 * Issue を生成
 */
function generateIssues(run: RunReport, latest: RunReport | null): {
  issues: { P0: Issue[]; P1: Issue[]; P2: Issue[] };
  regressions: Issue[];
  improvements: Issue[];
} {
  const issues: { P0: Issue[]; P1: Issue[]; P2: Issue[] } = {
    P0: [],
    P1: [],
    P2: [],
  };
  const regressions: Issue[] = [];
  const improvements: Issue[] = [];

  // 1. self-check の失敗
  if (!run.self_check.success) {
    issues.P0.push({
      priority: 'P0',
      category: 'self-check',
      title: 'Self-check failed',
      description: run.self_check.error || 'Unknown error',
      recommendation: 'Run `npm run self-check` locally and fix the issues',
    });
  }

  // 2. self-check の個別チェック結果
  if (run.self_check.checks) {
    for (const check of run.self_check.checks) {
      if (check.status === 'fail') {
        issues.P1.push({
          priority: 'P1',
          category: 'self-check',
          title: `Check failed: ${check.name}`,
          description: check.message || 'No details',
          recommendation: 'Investigate and fix the failing check',
        });
      } else if (check.status === 'warn') {
        issues.P2.push({
          priority: 'P2',
          category: 'self-check',
          title: `Check warning: ${check.name}`,
          description: check.message || 'No details',
          recommendation: 'Review and address the warning',
        });
      }
    }
  }

  // 3. deprecation-check の失敗
  if (!run.deprecation_check.success) {
    issues.P1.push({
      priority: 'P1',
      category: 'deprecation-check',
      title: 'Deprecation check failed',
      description: run.deprecation_check.error || 'Unknown error',
      recommendation: 'Check SUPABASE_SERVICE_ROLE_KEY and DB connection',
    });
  }

  // 4. 廃止候補スキル
  for (const candidate of run.deprecation_check.candidates) {
    const priority = candidate.recommended_action === 'deprecate' ? 'P1' : 'P2';
    issues[priority].push({
      priority,
      category: 'skill-deprecation',
      title: `Skill deprecation candidate: ${candidate.skill_key}`,
      description: `Reasons: ${candidate.reasons.join(', ')}`,
      recommendation: candidate.recommended_action === 'deprecate'
        ? 'Consider deprecating this skill'
        : 'Monitor skill usage and performance',
    });
  }

  // 5. latest.json との比較（regression 検出）
  if (latest) {
    // self-check の regression
    if (latest.self_check.success && !run.self_check.success) {
      regressions.push({
        priority: 'P0',
        category: 'self-check',
        title: 'Self-check regression',
        description: 'Self-check was passing but now failing',
        recommendation: 'Investigate recent changes that caused the regression',
        is_regression: true,
      });
    }

    // deprecation candidates の増加
    const prevCandidateKeys = new Set(latest.deprecation_check.candidates.map(c => c.skill_key));
    const newCandidates = run.deprecation_check.candidates.filter(
      c => !prevCandidateKeys.has(c.skill_key)
    );

    for (const candidate of newCandidates) {
      regressions.push({
        priority: 'P2',
        category: 'skill-deprecation',
        title: `New deprecation candidate: ${candidate.skill_key}`,
        description: `This skill became a deprecation candidate since last check`,
        recommendation: 'Review skill usage and consider action',
        is_regression: true,
      });
    }

    // 改善の検出
    if (!latest.self_check.success && run.self_check.success) {
      improvements.push({
        priority: 'P2',
        category: 'self-check',
        title: 'Self-check fixed',
        description: 'Self-check was failing but is now passing',
        recommendation: 'Great job! Continue monitoring',
      });
    }

    // 廃止候補の減少
    const currCandidateKeys = new Set(run.deprecation_check.candidates.map(c => c.skill_key));
    const resolvedCandidates = latest.deprecation_check.candidates.filter(
      c => !currCandidateKeys.has(c.skill_key)
    );

    for (const candidate of resolvedCandidates) {
      improvements.push({
        priority: 'P2',
        category: 'skill-deprecation',
        title: `Resolved: ${candidate.skill_key}`,
        description: 'This skill is no longer a deprecation candidate',
        recommendation: 'Skill health improved',
      });
    }
  }

  return { issues, regressions, improvements };
}

/**
 * 全体的な健全性を判定
 */
function determineOverallHealth(issues: { P0: Issue[]; P1: Issue[]; P2: Issue[] }): 'critical' | 'warning' | 'healthy' {
  if (issues.P0.length > 0) return 'critical';
  if (issues.P1.length > 0) return 'warning';
  return 'healthy';
}

/**
 * 次のアクションを生成
 */
function generateNextActions(
  issues: { P0: Issue[]; P1: Issue[]; P2: Issue[] },
  regressions: Issue[]
): string[] {
  const actions: string[] = [];

  if (issues.P0.length > 0) {
    actions.push('🚨 CRITICAL: Address P0 issues immediately');
    for (const issue of issues.P0) {
      actions.push(`  - ${issue.title}: ${issue.recommendation}`);
    }
  }

  if (regressions.length > 0) {
    actions.push('⚠️ REGRESSION: Review recent changes');
    for (const reg of regressions) {
      actions.push(`  - ${reg.title}`);
    }
  }

  if (issues.P1.length > 0) {
    actions.push('📋 P1: Schedule fixes for P1 issues');
  }

  if (issues.P2.length > 0) {
    actions.push('📝 P2: Review P2 issues in next planning session');
  }

  if (actions.length === 0) {
    actions.push('✅ All systems healthy. No immediate action required.');
  }

  return actions;
}

/**
 * サマリーを出力
 */
function printSummary(summary: SummaryReport): void {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    OPS REPORT SUMMARY                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const healthIcon = {
    critical: '🔴',
    warning: '🟡',
    healthy: '🟢',
  }[summary.overall_health];

  console.log(`Generated: ${summary.generated_at}`);
  console.log(`Run timestamp: ${summary.run_timestamp}`);
  console.log(`Overall Health: ${healthIcon} ${summary.overall_health.toUpperCase()}\n`);

  console.log('─────────────────────────────────────────────────────────────');
  console.log('ISSUES BY PRIORITY');
  console.log('─────────────────────────────────────────────────────────────\n');

  if (summary.issues.P0.length > 0) {
    console.log('🚨 P0 (Critical) - Requires immediate attention:');
    for (const issue of summary.issues.P0) {
      console.log(`  • [${issue.category}] ${issue.title}`);
      console.log(`    Description: ${issue.description}`);
      console.log(`    Action: ${issue.recommendation}\n`);
    }
  }

  if (summary.issues.P1.length > 0) {
    console.log('⚠️ P1 (High) - Should be addressed soon:');
    for (const issue of summary.issues.P1) {
      console.log(`  • [${issue.category}] ${issue.title}`);
      console.log(`    Description: ${issue.description}`);
      console.log(`    Action: ${issue.recommendation}\n`);
    }
  }

  if (summary.issues.P2.length > 0) {
    console.log('📝 P2 (Medium) - Address when possible:');
    for (const issue of summary.issues.P2) {
      console.log(`  • [${issue.category}] ${issue.title}`);
      console.log(`    Description: ${issue.description}`);
      console.log(`    Action: ${issue.recommendation}\n`);
    }
  }

  if (summary.issues.P0.length === 0 && summary.issues.P1.length === 0 && summary.issues.P2.length === 0) {
    console.log('  No issues found! 🎉\n');
  }

  if (summary.regressions.length > 0) {
    console.log('─────────────────────────────────────────────────────────────');
    console.log('⬇️ REGRESSIONS (since last run)');
    console.log('─────────────────────────────────────────────────────────────\n');
    for (const reg of summary.regressions) {
      console.log(`  • [${reg.category}] ${reg.title}`);
      console.log(`    ${reg.description}\n`);
    }
  }

  if (summary.improvements.length > 0) {
    console.log('─────────────────────────────────────────────────────────────');
    console.log('⬆️ IMPROVEMENTS (since last run)');
    console.log('─────────────────────────────────────────────────────────────\n');
    for (const imp of summary.improvements) {
      console.log(`  • [${imp.category}] ${imp.title}`);
      console.log(`    ${imp.description}\n`);
    }
  }

  console.log('─────────────────────────────────────────────────────────────');
  console.log('NEXT ACTIONS');
  console.log('─────────────────────────────────────────────────────────────\n');
  for (const action of summary.next_actions) {
    console.log(action);
  }
  console.log('');
}

/**
 * メイン実行
 */
function main() {
  const reportsDir = path.resolve(__dirname, '../reports');

  // run.json を読み込む
  const run = loadRunReport(reportsDir);
  if (!run) {
    process.exit(1);
  }

  // latest.json を読み込む（比較用）
  const latest = loadLatestReport(reportsDir);

  // Issue 生成
  const { issues, regressions, improvements } = generateIssues(run, latest);

  // サマリー生成
  const summary: SummaryReport = {
    generated_at: new Date().toISOString(),
    run_timestamp: run.timestamp,
    issues,
    regressions,
    improvements,
    overall_health: determineOverallHealth(issues),
    next_actions: generateNextActions(issues, regressions),
  };

  // 出力
  printSummary(summary);

  // サマリーを JSON でも保存
  const summaryJsonPath = path.join(reportsDir, 'summary.json');
  fs.writeFileSync(summaryJsonPath, JSON.stringify(summary, null, 2));
  console.log(`Summary saved to: ${summaryJsonPath}\n`);

  // 終了コード（P0 がある場合は 1）
  if (issues.P0.length > 0) {
    process.exit(1);
  }
}

main();
