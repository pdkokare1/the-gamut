import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { config } from './config';
import { createContext } from './context';
import { appRouter } from './routers/root'; // We will create this next

const server = Fastify({
  logger: true, // Replaces Pino manual setup
  maxParamLength: 5000,
});

async function main() {
  // 1. Security & CORS
  await server.register(cors, {
    origin: '*', // Lock this down in production later
    credentials: true,
  });
  await server.register(helmet);

  // 2. tRPC API Layer
  await server.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: { router: appRouter, createContext },
  });

  // 3. Health Check
  server.get('/health', async () => {
    return { status: 'ok', service: 'api' };
  });

  // 4. Start Server
  try {
    await server.listen({ port: Number(config.port), host: '0.0.0.0' });
    console.log(`🚀 API running on http://0.0.0.0:${config.port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
