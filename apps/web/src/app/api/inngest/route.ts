import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { handleSkillExecute } from '@/lib/inngest/functions/skill-execute';

/**
 * Inngest サーブエンドポイント
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [handleSkillExecute],
});
