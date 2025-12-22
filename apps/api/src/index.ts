import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit'; // New Import
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { appRouter } from './routers/root';
import { createContext } from './context';
import { shareRoutes } from './routes/share';
import { initScheduler } from './scheduler'; 

const server = Fastify({
  maxParamLength: 5000,
  logger: true,
});

async function main() {
  await server.register(cors, {
    origin: '*',
  });

  // SAFETY: Rate Limiting
  // Limit each IP to 100 requests per 1 minute window
  await server.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: (req, context) => ({
      code: 429,
      error: 'Too Many Requests',
      message: `I'm only human (and a server). You hit the limit of ${context.max} requests per ${context.after}.`
    })
  });

  await server.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: { router: appRouter, createContext },
  });

  await server.register(shareRoutes);

  server.get('/health', async () => {
    return { status: 'ok', timestamp: new Date() };
  });

  try {
    const port = parseInt(process.env.PORT || '4000');
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 API Server running on port ${port}`);
    
    await initScheduler();
    
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
