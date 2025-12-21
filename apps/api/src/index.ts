import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { appRouter } from './routers/root';
import { createContext } from './context';
import { shareRoutes } from './routes/share';
import { initScheduler } from './scheduler'; // New Import

const server = Fastify({
  maxParamLength: 5000,
  logger: true,
});

async function main() {
  await server.register(cors, {
    origin: '*',
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
    
    // Initialize the background scheduler
    await initScheduler();
    
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
