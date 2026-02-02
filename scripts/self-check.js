#!/usr/bin/env node
/**
 * AI Company OS Self-Check Script
 *
 * システムの健全性を確認するための自己診断スクリプト
 *
 * 実行: pnpm self-check
 * オプション:
 *   --full, -f    TypeScript型チェックを含める
 *   --save, -s    結果をDBに保存
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

const PASS = `${colors.green}PASS${colors.reset}`;
const FAIL = `${colors.red}FAIL${colors.reset}`;
const WARN = `${colors.yellow}WARN${colors.reset}`;
const INFO = `${colors.cyan}INFO${colors.reset}`;

let passCount = 0;
let failCount = 0;
let warnCount = 0;

// 結果収集用
const checkResults = [];

function log(status, message, detail = '') {
  const detailStr = detail ? ` ${colors.dim}${detail}${colors.reset}` : '';
  console.log(`  [${status}] ${message}${detailStr}`);
}

function check(name, fn, category = 'general') {
  try {
    const result = fn();
    if (result === true || result === 'pass') {
      log(PASS, name);
      passCount++;
      checkResults.push({ category, check: name, status: 'pass' });
      return true;
    } else if (result === 'warn' || (typeof result === 'object' && result.warn)) {
      const msg = typeof result === 'object' ? result.message : '';
      log(WARN, name, msg);
      warnCount++;
      checkResults.push({ category, check: name, status: 'warn', message: msg });
      return true;
    } else {
      const msg = typeof result === 'string' ? result : '';
      log(FAIL, name, msg);
      failCount++;
      checkResults.push({ category, check: name, status: 'fail', message: msg });
      return false;
    }
  } catch (err) {
    log(FAIL, name, err.message);
    failCount++;
    checkResults.push({ category, check: name, status: 'fail', message: err.message });
    return false;
  }
}

function fileExists(filePath) {
  return fs.existsSync(path.resolve(__dirname, '..', filePath));
}

function readJson(filePath) {
  const fullPath = path.resolve(__dirname, '..', filePath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
}

function exec(cmd, options = {}) {
  return execSync(cmd, {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf-8',
    stdio: 'pipe',
    ...options,
  });
}

// ============================================
// Main Check Categories
// ============================================

function checkProjectStructure() {
  console.log('\n1. Project Structure');
  console.log('   ─────────────────');
  const cat = 'structure';

  check('Root package.json exists', () => fileExists('package.json'), cat);
  check('pnpm-workspace.yaml exists', () => fileExists('pnpm-workspace.yaml'), cat);
  check('turbo.json exists', () => fileExists('turbo.json'), cat);

  // Packages
  check('packages/skill-spec exists', () => fileExists('packages/skill-spec/package.json'), cat);
  check('packages/database exists', () => fileExists('packages/database/package.json'), cat);
  check('packages/runner exists', () => fileExists('packages/runner/package.json'), cat);
  check('packages/skills exists', () => fileExists('packages/skills/package.json'), cat);

  // Apps
  check('apps/web exists', () => fileExists('apps/web/package.json'), cat);
}

function checkDependencies() {
  console.log('\n2. Dependencies');
  console.log('   ────────────');
  const cat = 'dependencies';

  check('node_modules installed', () => fileExists('node_modules'), cat);

  check('Node.js version >= 20', () => {
    const version = process.version;
    const major = parseInt(version.slice(1).split('.')[0], 10);
    if (major >= 20) return true;
    return `Current: ${version}`;
  }, cat);

  check('pnpm available', () => {
    try {
      exec('pnpm --version');
      return true;
    } catch {
      return 'pnpm not found';
    }
  }, cat);
}

function checkBuild() {
  console.log('\n3. Build Status');
  console.log('   ─────────────');
  const cat = 'build';

  check('skill-spec dist exists', () => fileExists('packages/skill-spec/dist/index.js'), cat);
  check('database dist exists', () => fileExists('packages/database/dist/index.js'), cat);
  check('runner dist exists', () => fileExists('packages/runner/dist/index.js'), cat);
  check('skills dist exists', () => fileExists('packages/skills/dist/index.js'), cat);
  check('web .next exists', () => fileExists('apps/web/.next'), cat);
}

function checkSkillRegistry() {
  console.log('\n4. Skill Registry');
  console.log('   ───────────────');
  const cat = 'registry';

  // Check generated registry file
  check('Generated registry exists', () =>
    fileExists('packages/skills/src/generated/skill-registry.ts')
  , cat);

  // Check skill files
  const skillCategories = [
    { name: 'governance', expected: ['execution-summary', 'budget-insight', 'decision-brief'] },
    { name: 'internal', expected: ['summary'] },
  ];

  for (const category of skillCategories) {
    const categoryPath = `packages/skills/src/${category.name}`;
    check(`${category.name}/ category exists`, () => {
      if (!fileExists(categoryPath)) return `Missing: ${categoryPath}`;
      return true;
    }, cat);
  }

  // Count skills in registry
  check('Registry has skills registered', () => {
    const registryPath = path.resolve(__dirname, '..', 'packages/skills/src/generated/skill-registry.ts');
    if (!fs.existsSync(registryPath)) return 'Registry file not found';

    const content = fs.readFileSync(registryPath, 'utf-8');

    // Check "Total skills:" comment
    const totalMatch = content.match(/Total skills:\s*(\d+)/);
    if (totalMatch) {
      const count = parseInt(totalMatch[1], 10);
      if (count >= 4) return true;
      return `Only ${count} skills found (expected >= 4)`;
    }

    // Fallback: count registry.register() calls
    const registerCalls = content.match(/registry\.register\(/g) || [];
    const count = registerCalls.length;

    if (count >= 4) return true;
    return `Only ${count} skills found (expected >= 4)`;
  }, cat);
}

function checkInternalSkillProtection() {
  console.log('\n5. Internal Skill Protection');
  console.log('   ──────────────────────────');
  const cat = 'security';

  // API Layer Protection
  check('API execute route has internal check', () => {
    const routePath = 'apps/web/src/app/api/skills/[key]/execute/route.ts';
    if (!fileExists(routePath)) return 'File not found';

    const content = fs.readFileSync(
      path.resolve(__dirname, '..', routePath),
      'utf-8'
    );

    if (!content.includes("category === 'internal'")) {
      return 'Missing internal category check';
    }
    if (!content.includes('403')) {
      return 'Missing 403 response';
    }
    return true;
  }, cat);

  // Inngest Layer Protection
  check('Inngest handler has internal check', () => {
    const handlerPath = 'apps/web/src/lib/inngest/functions/skill-execute.ts';
    if (!fileExists(handlerPath)) return 'File not found';

    const content = fs.readFileSync(
      path.resolve(__dirname, '..', handlerPath),
      'utf-8'
    );

    if (!content.includes("category === 'internal'")) {
      return 'Missing internal category check';
    }
    if (!content.includes('parent_execution_id')) {
      return 'Missing parent_execution_id check';
    }
    if (!content.includes('INTERNAL_SKILL_BLOCKED')) {
      return 'Missing blocked error code';
    }
    if (!content.includes('auditLogger.log')) {
      return 'Missing audit logging';
    }
    return true;
  }, cat);

  // Skills API excludes internal
  check('Skills list API excludes internal', () => {
    const apiPath = 'apps/web/src/app/api/skills/route.ts';
    if (!fileExists(apiPath)) return 'File not found';

    const content = fs.readFileSync(
      path.resolve(__dirname, '..', apiPath),
      'utf-8'
    );

    if (!content.includes("category !== 'internal'")) {
      return 'Missing internal filter';
    }
    return true;
  }, cat);
}

function checkEnvironmentConfig() {
  console.log('\n6. Environment Configuration');
  console.log('   ──────────────────────────');
  const cat = 'environment';

  check('.env.example exists', () => fileExists('apps/web/.env.example'), cat);

  // Check if .env.local exists (warn if not)
  check('.env.local configured', () => {
    if (fileExists('apps/web/.env.local')) return true;
    return { warn: true, message: 'Create from .env.example' };
  }, cat);

  // Check required env vars in example
  check('.env.example has required vars', () => {
    const examplePath = 'apps/web/.env.example';
    if (!fileExists(examplePath)) return 'File not found';

    const content = fs.readFileSync(
      path.resolve(__dirname, '..', examplePath),
      'utf-8'
    );

    const required = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'INNGEST_EVENT_KEY',
      'ANTHROPIC_API_KEY',
    ];

    const missing = required.filter(v => !content.includes(v));
    if (missing.length > 0) {
      return `Missing: ${missing.join(', ')}`;
    }
    return true;
  }, cat);
}

function checkCompanyOSIntegrity() {
  console.log('\n7. Company OS Integrity');
  console.log('   ─────────────────────');
  const cat = 'company-os';

  // Check minimum skill count
  check('Skill count >= 10', () => {
    const registryPath = path.resolve(__dirname, '..', 'packages/skills/src/generated/skill-registry.ts');
    if (!fs.existsSync(registryPath)) return 'Registry file not found';

    const content = fs.readFileSync(registryPath, 'utf-8');
    const totalMatch = content.match(/Total skills:\s*(\d+)/);
    if (!totalMatch) return 'Cannot parse skill count';

    const count = parseInt(totalMatch[1], 10);
    if (count >= 10) return true;
    return `Only ${count} skills (expected >= 10)`;
  }, cat);

  // Check required skill categories
  check('All required categories exist', () => {
    const requiredCategories = ['governance', 'operations', 'engineering', 'ai-affairs', 'internal'];
    const skillsDir = path.resolve(__dirname, '..', 'packages/skills/src');

    const missing = requiredCategories.filter(cat => {
      const catPath = path.join(skillsDir, cat);
      return !fs.existsSync(catPath);
    });

    if (missing.length === 0) return true;
    return `Missing categories: ${missing.join(', ')}`;
  }, cat);

  // Check agent definitions exist
  check('Agent definitions exist', () => {
    const agentsPath = path.resolve(__dirname, '..', 'packages/agents/src/definitions');
    if (!fs.existsSync(agentsPath)) return 'Agents directory not found';

    const files = fs.readdirSync(agentsPath);
    const agentFiles = files.filter(f => f.endsWith('.agent.ts'));

    if (agentFiles.length >= 4) return true;
    return `Only ${agentFiles.length} agents defined (expected >= 4)`;
  }, cat);

  // Check design doc alignment
  check('Design doc exists', () => {
    return fileExists('docs/agents-and-skills.md');
  }, cat);

  // Check ops infrastructure
  check('Ops check infrastructure exists', () => {
    return fileExists('ops/check/run-checks.ts') && fileExists('ops/report/summarize.ts');
  }, cat);
}

function checkTypeScript() {
  console.log('\n8. TypeScript');
  console.log('   ──────────');
  const cat = 'typescript';

  check('Type check passes', () => {
    try {
      exec('pnpm type-check', { timeout: 60000 });
      return true;
    } catch (err) {
      return 'Type errors found';
    }
  }, cat);
}

// ============================================
// DB Save Function
// ============================================

async function saveResultsToDB(duration) {
  // 環境変数確認
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log(`\n  [${WARN}] DB保存スキップ: 環境変数未設定`);
    console.log(`       SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY を設定してください`);
    return false;
  }

  try {
    // Supabase REST API を直接呼び出し（依存追加不要）
    const pkg = readJson('package.json');
    const systemVersion = pkg.version || '0.0.0';

    const payload = {
      trigger_type: 'manual',
      system_version: systemVersion,
      issues_total: failCount + warnCount,
      issues_auto_fixed: 0,
      issues_pending_approval: failCount,
      summary: checkResults,
      full_report: {
        started_at: new Date().toISOString(),
        duration_ms: Math.round(duration * 1000),
        environment: {
          node_version: process.version,
          platform: process.platform,
          cwd: process.cwd(),
        },
        totals: {
          passed: passCount,
          failed: failCount,
          warnings: warnCount,
        },
      },
    };

    const response = await fetch(`${supabaseUrl}/rest/v1/system_self_diagnosis_logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      console.log(`\n  [${FAIL}] DB保存失敗: ${response.status}`);
      console.error(`       ${text}`);
      return false;
    }

    console.log(`\n  [${PASS}] 診断結果をDBに保存しました`);
    return true;
  } catch (err) {
    console.log(`\n  [${FAIL}] DB保存エラー: ${err.message}`);
    return false;
  }
}

// ============================================
// Run All Checks
// ============================================

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║   AI Company OS - Self Check Report    ║');
  console.log('╚════════════════════════════════════════╝');

  const startTime = Date.now();

  checkProjectStructure();
  checkDependencies();
  checkBuild();
  checkSkillRegistry();
  checkInternalSkillProtection();
  checkEnvironmentConfig();
  checkCompanyOSIntegrity();

  // TypeScript check is slow, make it optional
  if (process.argv.includes('--full') || process.argv.includes('-f')) {
    checkTypeScript();
  } else {
    console.log('\n8. TypeScript');
    console.log('   ──────────');
    log(INFO, 'Skipped (use --full to include)');
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  // Summary
  console.log('\n────────────────────────────────────────');
  console.log(`  Summary: ${colors.green}${passCount} passed${colors.reset}, ` +
    `${failCount > 0 ? colors.red : colors.dim}${failCount} failed${colors.reset}, ` +
    `${warnCount > 0 ? colors.yellow : colors.dim}${warnCount} warnings${colors.reset}`);
  console.log(`  Time: ${duration}s`);
  console.log('────────────────────────────────────────');

  // Save to DB if requested
  if (process.argv.includes('--save') || process.argv.includes('-s')) {
    await saveResultsToDB(parseFloat(duration));
  }

  console.log('');

  // Exit code
  process.exit(failCount > 0 ? 1 : 0);
}

main();
