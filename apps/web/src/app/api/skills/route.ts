import { NextResponse } from 'next/server';
import { initializeRegistry } from '@ai-company-os/skills';

// Build-time Registry（シングルトン）
const registry = initializeRegistry();

/**
 * スキル一覧取得API
 *
 * - 認証不要（公開情報）
 * - internalカテゴリは除外して返却
 * - 実行にはPOST /api/skills/[key]/executeを使用
 */
export async function GET() {
  const allSkills = registry.list();

  // internalカテゴリを除外（外部公開用）
  const publicSkills = allSkills
    .filter((spec) => spec.category !== 'internal')
    .map((spec) => ({
      key: spec.key,
      name: spec.name,
      description: spec.description,
      version: spec.version,
      category: spec.category,
      tags: spec.tags,
      requires_approval: spec.safety.requires_approval,
      has_external_effect: spec.has_external_effect,
    }));

  return NextResponse.json({
    skills: publicSkills,
    total: publicSkills.length,
    registry_total: allSkills.length,
  });
}
