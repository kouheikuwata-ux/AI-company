/**
 * Seed skills and skill_versions tables
 */

const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpqam1lZWJjYmR2bnNkZGVvZGliIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTk2OTA5MywiZXhwIjoyMDg1NTQ1MDkzfQ.ngmvbshppsGdkhvcchJ4FuKp2DnJTvcoFGbJq7mo_C4';
const BASE_URL = 'https://zjjmeebcbdvnsddeodib.supabase.co/rest/v1';
const TENANT_ID = '1542976a-8814-4019-a65b-c434ccf092bf';

const skills = [
  { key: 'engineering.system-health', name: 'システム健全性チェック', description: 'AI Company OSの全体的な健全性を診断', category: 'engineering' },
  { key: 'operations.daily-standup', name: '朝会レポート生成', description: '毎日の朝会用レポートを生成', category: 'operations' },
  { key: 'governance.execution-summary', name: '実行サマリーレポート', description: 'AI Company OS上で発生した実行を集計', category: 'governance' },
  { key: 'governance.decision-brief', name: '判断材料ブリーフ', description: '判断材料を1ページに圧縮して提供', category: 'governance' },
  { key: 'governance.budget-insight', name: '予算・コスト分析', description: 'スキル別・エージェント別のコスト構造を可視化', category: 'governance' },
  { key: 'internal.self-diagnosis', name: '自己診断', description: 'システム内部の自己診断', category: 'internal' },
];

async function seed() {
  for (const skill of skills) {
    console.log(`Creating skill: ${skill.key}`);

    // Create skill
    const skillResp = await fetch(`${BASE_URL}/skills`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        key: skill.key,
        name: skill.name,
        description: skill.description,
        category: skill.category,
      }),
    });

    const skillData = await skillResp.json();

    if (!skillResp.ok) {
      console.error(`Failed to create skill: ${skill.key}`, skillData);
      continue;
    }

    const skillId = skillData[0]?.id;
    console.log(`  Created skill ID: ${skillId}`);

    // Create skill version
    const versionResp = await fetch(`${BASE_URL}/skill_versions`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        skill_id: skillId,
        version: '1.0.0',
        spec: { key: skill.key, version: '1.0.0' },
        is_published: true,
      }),
    });

    const versionData = await versionResp.json();

    if (!versionResp.ok) {
      console.error(`Failed to create skill version:`, versionData);
      continue;
    }

    const versionId = versionData[0]?.id;
    console.log(`  Created version ID: ${versionId}`);

    // Update skill with active_version_id
    await fetch(`${BASE_URL}/skills?id=eq.${skillId}`, {
      method: 'PATCH',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        active_version_id: versionId,
      }),
    });

    console.log(`  Updated active_version_id`);
  }

  console.log('Done!');
}

seed().catch(console.error);
