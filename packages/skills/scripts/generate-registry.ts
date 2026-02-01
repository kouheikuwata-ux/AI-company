/**
 * Build-time Skill Registry Generator
 *
 * ビルド時に全スキルファイルをスキャンし、
 * 静的なレジストリ初期化コードを生成します。
 *
 * これにより、動的importの問題を回避し、
 * Vercelなどのサーバーレス環境でも安定動作します。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

// ESモジュールで__dirnameを取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateRegistry() {
  const srcDir = path.join(__dirname, '../src');
  const outputDir = path.join(srcDir, 'generated');

  // 出力ディレクトリ作成
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 全スキルファイルを検索
  const skillFiles = await glob('**/*.skill.ts', { cwd: srcDir });

  if (skillFiles.length === 0) {
    console.log('No skill files found. Creating placeholder registry.');
    createPlaceholderRegistry(outputDir);
    return;
  }

  const imports: string[] = [];
  const registrations: string[] = [];

  for (const file of skillFiles) {
    // ファイルパスから変数名を生成
    const relativePath = '../' + file.replace('.ts', '').replace(/\\/g, '/');
    const varName = file
      .replace('.skill.ts', '')
      .replace(/[\\/]/g, '_')
      .replace(/-/g, '_');

    imports.push(`import * as ${varName} from '${relativePath}';`);
    registrations.push(
      `  registry.register(${varName}.spec, ${varName}.execute, ${varName}.inputSchema);`
    );
  }

  const output = `// AUTO-GENERATED FILE - DO NOT EDIT
// Generated at: ${new Date().toISOString()}
// Total skills: ${skillFiles.length}

import { SkillRegistry } from '../registry';
${imports.join('\n')}

/**
 * レジストリ初期化
 * ビルド時に全スキルが静的に登録されます
 */
export function initializeRegistry(): SkillRegistry {
  const registry = new SkillRegistry();
${registrations.join('\n')}
  return registry;
}
`;

  const outputPath = path.join(outputDir, 'skill-registry.ts');
  fs.writeFileSync(outputPath, output);

  console.log(`Generated registry with ${skillFiles.length} skills at ${outputPath}`);
}

function createPlaceholderRegistry(outputDir: string) {
  const output = `// AUTO-GENERATED FILE - DO NOT EDIT
// Generated at: ${new Date().toISOString()}
// No skills found - placeholder registry

import { SkillRegistry } from '../registry';

/**
 * レジストリ初期化（プレースホルダー）
 * スキルを追加後、pnpm skills:generate を実行してください
 */
export function initializeRegistry(): SkillRegistry {
  const registry = new SkillRegistry();
  // No skills registered
  return registry;
}
`;

  fs.writeFileSync(path.join(outputDir, 'skill-registry.ts'), output);
  console.log('Created placeholder registry (no skills found)');
}

generateRegistry().catch((error) => {
  console.error('Failed to generate registry:', error);
  process.exit(1);
});
