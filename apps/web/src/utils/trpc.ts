import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../../../api/src/routers/root';

// This gives us a strongly-typed hook to use in our components
export const trpc = createTRPCReact<AppRouter>();
