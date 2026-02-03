interface AgentStatus {
  key: string;
  name: string;
  role: string;
  department: string;
  status: 'active' | 'idle' | 'busy' | 'error';
  lastActivity?: string;
  currentTask?: string;
}

interface AgentStatusCardProps {
  agents: AgentStatus[];
}

const roleEmoji: Record<string, string> = {
  executive: '\uD83D\uDC51',
  manager: '\uD83D\uDC64',
  specialist: '\uD83D\uDD27',
};

const departmentLabel: Record<string, string> = {
  executive: '\u7D4C\u55B6',
  finance: '\u8CA1\u52D9',
  operations: '\u904B\u7528',
  technology: '\u6280\u8853',
  governance: '\u30AC\u30D0\u30CA\u30F3\u30B9',
};

const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
  active: {
    bg: 'bg-green-100 dark:bg-green-900/20',
    text: 'text-green-800 dark:text-green-200',
    label: '\u7A3C\u50CD\u4E2D',
  },
  idle: {
    bg: 'bg-gray-100 dark:bg-gray-700',
    text: 'text-gray-800 dark:text-gray-200',
    label: '\u5F85\u6A5F',
  },
  busy: {
    bg: 'bg-blue-100 dark:bg-blue-900/20',
    text: 'text-blue-800 dark:text-blue-200',
    label: '\u5B9F\u884C\u4E2D',
  },
  error: {
    bg: 'bg-red-100 dark:bg-red-900/20',
    text: 'text-red-800 dark:text-red-200',
    label: '\u30A8\u30E9\u30FC',
  },
};

/**
 * AgentStatusCard - エージェント一覧とステータス表示
 */
export function AgentStatusCard({ agents }: AgentStatusCardProps) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">\u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u30B9\u30C6\u30FC\u30BF\u30B9</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {agents.map((agent) => {
          const style = statusStyles[agent.status];
          const emoji = roleEmoji[agent.role] || '\uD83E\uDD16';
          const dept = departmentLabel[agent.department] || agent.department;

          return (
            <div
              key={agent.key}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{emoji}</span>
                  <div>
                    <p className="font-medium text-sm">{agent.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {dept}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}
                >
                  {style.label}
                </span>
              </div>

              {agent.currentTask && (
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-300 truncate">
                  {agent.currentTask}
                </p>
              )}

              {agent.lastActivity && (
                <p className="mt-1 text-xs text-gray-400">
                  \u6700\u7D42\u6D3B\u52D5: {agent.lastActivity}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AgentStatusCard;
