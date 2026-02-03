interface Execution {
  id: string;
  skill_key: string;
  state: string;
  created_at: string;
  completed_at?: string;
  result_status?: string;
  executor_type: string;
  executor_id: string;
}

interface ExecutionTimelineProps {
  executions: Execution[];
  maxItems?: number;
}

const stateStyles: Record<string, { bg: string; text: string; icon: string }> = {
  COMPLETED: {
    bg: 'bg-green-100 dark:bg-green-900/20',
    text: 'text-green-800 dark:text-green-200',
    icon: '\u2713',
  },
  FAILED: {
    bg: 'bg-red-100 dark:bg-red-900/20',
    text: 'text-red-800 dark:text-red-200',
    icon: '\u2717',
  },
  RUNNING: {
    bg: 'bg-blue-100 dark:bg-blue-900/20',
    text: 'text-blue-800 dark:text-blue-200',
    icon: '\u25B6',
  },
  PENDING_APPROVAL: {
    bg: 'bg-yellow-100 dark:bg-yellow-900/20',
    text: 'text-yellow-800 dark:text-yellow-200',
    icon: '\u23F8',
  },
  CREATED: {
    bg: 'bg-gray-100 dark:bg-gray-700',
    text: 'text-gray-800 dark:text-gray-200',
    icon: '\u25CB',
  },
};

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return '\u305F\u3063\u305F\u4ECA';
  if (diffMins < 60) return `${diffMins}\u5206\u524D`;
  if (diffHours < 24) return `${diffHours}\u6642\u9593\u524D`;
  if (diffDays < 7) return `${diffDays}\u65E5\u524D`;

  return date.toLocaleString('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const diffMs = end.getTime() - start.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);

  if (diffSecs < 60) return `${diffSecs}\u79D2`;
  return `${diffMins}\u5206${diffSecs % 60}\u79D2`;
}

/**
 * ExecutionTimeline - \u5B9F\u884C\u5C65\u6B74\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3
 */
export function ExecutionTimeline({ executions, maxItems = 10 }: ExecutionTimelineProps) {
  const displayExecutions = executions.slice(0, maxItems);

  if (displayExecutions.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">\u5B9F\u884C\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3</h2>
        <p className="text-gray-500 dark:text-gray-400">\u5B9F\u884C\u5C65\u6B74\u304C\u3042\u308A\u307E\u305B\u3093</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">\u5B9F\u884C\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3</h2>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />

        <ul className="space-y-4">
          {displayExecutions.map((exec) => {
            const style = stateStyles[exec.state] || stateStyles.CREATED;

            return (
              <li key={exec.id} className="relative pl-10">
                {/* Timeline dot */}
                <div
                  className={`absolute left-2 top-1.5 w-5 h-5 rounded-full flex items-center justify-center text-xs ${style.bg} ${style.text}`}
                >
                  {style.icon}
                </div>

                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{exec.skill_key}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {exec.executor_type}: {exec.executor_id.slice(0, 8)}
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${style.bg} ${style.text}`}
                    >
                      {exec.state}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{formatTime(exec.created_at)}</span>
                    {exec.completed_at && (
                      <span>
                        \u6240\u8981: {formatDuration(exec.created_at, exec.completed_at)}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {executions.length > maxItems && (
        <div className="mt-4 text-center">
          <a
            href="/executions"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            \u3059\u3079\u3066\u306E\u5B9F\u884C\u3092\u898B\u308B \u2192
          </a>
        </div>
      )}
    </div>
  );
}

export default ExecutionTimeline;
