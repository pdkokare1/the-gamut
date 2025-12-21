import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { appRouter } from './routers/root';
import { createContext } from './context';
import { shareRoutes } from './routes/share'; // New Import

const server = Fastify({
  maxParamLength: 5000,
  logger: true,
});

async function main() {
  await server.register(cors, {
    origin: '*', // Configure this for production later
  });

  // tRPC API Endpoint
  await server.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: { router: appRouter, createContext },
  });

  // Register Standard Routes (Social Share)
  await server.register(shareRoutes);

  // Health Check
  server.get('/health', async () => {
    return { status: 'ok', timestamp: new Date() };
  });

  try {
    const port = parseInt(process.env.PORT || '4000');
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 API Server running on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
