interface SkillStat {
  skill_key: string;
  total: number;
  completed: number;
  failed: number;
  success_rate: number;
}

interface SkillStatsCardProps {
  skills: SkillStat[];
  maxItems?: number;
}

/**
 * SkillStatsCard - スキル別統計表示
 */
export function SkillStatsCard({ skills, maxItems = 10 }: SkillStatsCardProps) {
  const displaySkills = skills.slice(0, maxItems);

  if (displaySkills.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">スキル別統計</h2>
        <p className="text-gray-500 dark:text-gray-400">データがありません</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">スキル別統計</h2>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <th className="pb-2 font-medium">スキル</th>
              <th className="pb-2 font-medium text-right">実行数</th>
              <th className="pb-2 font-medium text-right">成功</th>
              <th className="pb-2 font-medium text-right">失敗</th>
              <th className="pb-2 font-medium text-right">成功率</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {displaySkills.map((skill) => (
              <tr key={skill.skill_key} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td className="py-2">
                  <span className="font-medium text-sm">{skill.skill_key}</span>
                </td>
                <td className="py-2 text-right text-sm">{skill.total}</td>
                <td className="py-2 text-right text-sm text-green-600 dark:text-green-400">
                  {skill.completed}
                </td>
                <td className="py-2 text-right text-sm text-red-600 dark:text-red-400">
                  {skill.failed}
                </td>
                <td className="py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          skill.success_rate >= 80
                            ? 'bg-green-500'
                            : skill.success_rate >= 50
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${skill.success_rate}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium w-10 text-right">
                      {skill.success_rate}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default SkillStatsCard;
