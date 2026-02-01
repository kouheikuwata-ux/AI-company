export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between text-sm">
        <h1 className="text-4xl font-bold text-center mb-8">
          AI Company OS
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-12">
          人間責任 + AI執行補助システム v3.0
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="p-6 border rounded-lg hover:border-primary-500 transition-colors">
            <h2 className="text-xl font-semibold mb-2">Skill Registry</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Build-time生成による安全なスキル管理
            </p>
          </div>

          <div className="p-6 border rounded-lg hover:border-primary-500 transition-colors">
            <h2 className="text-xl font-semibold mb-2">State Machine</h2>
            <p className="text-gray-600 dark:text-gray-400">
              冪等性保証と状態遷移管理
            </p>
          </div>

          <div className="p-6 border rounded-lg hover:border-primary-500 transition-colors">
            <h2 className="text-xl font-semibold mb-2">責任モデル</h2>
            <p className="text-gray-600 dark:text-gray-400">
              人間責任者を必須とする設計
            </p>
          </div>
        </div>

        <div className="text-center">
          <a
            href="/dashboard"
            className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            ダッシュボードへ
          </a>
        </div>
      </div>
    </main>
  );
}
