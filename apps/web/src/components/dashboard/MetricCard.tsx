interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    value: string;
  };
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

/**
 * MetricCard - ダッシュボードメトリクス表示カード
 */
export function MetricCard({
  title,
  value,
  subtitle,
  trend,
  variant = 'default',
}: MetricCardProps) {
  const variantStyles = {
    default: 'bg-white dark:bg-slate-800',
    success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    danger: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  };

  const trendColors = {
    up: 'text-green-600 dark:text-green-400',
    down: 'text-red-600 dark:text-red-400',
    neutral: 'text-gray-500 dark:text-gray-400',
  };

  const trendIcons = {
    up: '\u2191',
    down: '\u2193',
    neutral: '\u2192',
  };

  return (
    <div className={`p-6 rounded-lg shadow border ${variantStyles[variant]}`}>
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
        {title}
      </h3>
      <div className="flex items-baseline gap-2 mt-1">
        <p className="text-3xl font-bold">{value}</p>
        {trend && (
          <span className={`text-sm font-medium ${trendColors[trend.direction]}`}>
            {trendIcons[trend.direction]} {trend.value}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {subtitle}
        </p>
      )}
    </div>
  );
}

export default MetricCard;
