import { router } from '../trpc';
import { articleRouter } from './article';
import { profileRouter } from './profile';

export const appRouter = router({
  article: articleRouter, // Access via trpc.article...
  profile: profileRouter, // Access via trpc.profile...
});

// Export type for the Frontend to use
export type AppRouter = typeof appRouter;
