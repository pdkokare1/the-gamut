import { router, publicProcedure } from '../trpc';
import { z } from 'zod';

export const emergencyRouter = router({
  // Get all emergency contacts, optionally filtered by country
  getAll: publicProcedure
    .input(z.object({ country: z.string().default('India') }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.emergencyContact.findMany({
        where: {
          OR: [
            { country: input.country },
            { isGlobal: true }
          ]
        },
        orderBy: { category: 'asc' }
      });
    }),
});
