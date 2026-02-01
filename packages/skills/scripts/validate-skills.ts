/**
 * Skill Validator
 *
 * 全スキルの仕様を検証し、問題があれば報告します。
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { validateSkillSpec } from '@ai-company-os/skill-spec';

interface ValidationError {
  file: string;
  errors: string[];
}

async function validateSkills() {
  const srcDir = path.join(__dirname, '../src');
  const skillFiles = await glob('**/*.skill.ts', { cwd: srcDir });

  console.log(`Found ${skillFiles.length} skill files to validate\n`);

  const errors: ValidationError[] = [];
  let validCount = 0;

  for (const file of skillFiles) {
    const filePath = path.join(srcDir, file);
    const fileErrors: string[] = [];

    try {
      // ファイル内容チェック
      const content = fs.readFileSync(filePath, 'utf-8');

      // 必須エクスポートチェック
      if (!content.includes('export const spec')) {
        fileErrors.push('Missing "export const spec" declaration');
      }
      if (!content.includes('export const execute')) {
        fileErrors.push('Missing "export const execute" declaration');
      }

      // specの形式チェック（簡易）
      const specMatch = content.match(/export const spec[^=]*=\s*({[\s\S]*?});/);
      if (specMatch) {
        // 必須フィールドチェック
        const requiredFields = ['key', 'version', 'name', 'description'];
        for (const field of requiredFields) {
          if (!specMatch[1].includes(`${field}:`)) {
            fileErrors.push(`Missing required field: ${field}`);
          }
        }
      }

      if (fileErrors.length === 0) {
        validCount++;
        console.log(`✓ ${file}`);
      } else {
        errors.push({ file, errors: fileErrors });
        console.log(`✗ ${file}`);
        fileErrors.forEach((e) => console.log(`  - ${e}`));
      }
    } catch (error) {
      errors.push({ file, errors: [(error as Error).message] });
      console.log(`✗ ${file}`);
      console.log(`  - ${(error as Error).message}`);
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Validation complete: ${validCount}/${skillFiles.length} skills valid`);

  if (errors.length > 0) {
    console.log(`\n${errors.length} skills have errors.`);
    process.exit(1);
  }

  console.log('\nAll skills are valid!');
}

validateSkills().catch((error) => {
  console.error('Validation failed:', error);
  process.exit(1);
});
