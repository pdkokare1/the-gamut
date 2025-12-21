import { router } from '../trpc';
import { articleRouter } from './article';
import { profileRouter } from './profile';
import { narrativeRouter } from './narrative';
import { emergencyRouter } from './emergency';

export const appRouter = router({
  article: articleRouter,
  profile: profileRouter,
  narrative: narrativeRouter,  // New: Access via trpc.narrative...
  emergency: emergencyRouter,  // New: Access via trpc.emergency...
});

// Export type for the Frontend to use
export type AppRouter = typeof appRouter;
