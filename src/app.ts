import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { env } from './config/env.js';
import prismaPlugin from './plugins/prisma.js';
import jwtPlugin from './plugins/jwt.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { serverRoutes } from './modules/servers/servers.routes.js';
import { channelRoutes } from './modules/channels/channels.routes.js';
import { messageRoutes } from './modules/messages/messages.routes.js';
import { voiceRoutes } from './modules/voice/voice.routes.js';
import { aiRoutes } from './modules/ai/ai.routes.js';
import { setupSocketIO } from './socket/index.js';

async function bootstrap() {
  const fastify = Fastify({
    logger: true,
  });

  // CORS
  await fastify.register(cors, {
    origin: true, // Allow all origins for dev/Tauri
    credentials: true,
  });

  // Cookies
  await fastify.register(cookie);

  // Custom Plugins
  await fastify.register(prismaPlugin);
  await fastify.register(jwtPlugin);

  // API Routes
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(serverRoutes, { prefix: '/api/servers' });
  await fastify.register(channelRoutes, { prefix: '/api/channels' });
  await fastify.register(messageRoutes, { prefix: '/api' });
  await fastify.register(voiceRoutes, { prefix: '/api/voice' });
  await fastify.register(aiRoutes, { prefix: '/api/ai' });

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', time: new Date().toISOString() };
  });

  // Attach Socket.IO
  setupSocketIO(fastify.server, fastify);

  // Start server
  try {
    await fastify.listen({ port: env.PORT, host: env.HOST });
    console.log(`🚀 Kova Backend API & WebSocket Server ejecutándose en http://localhost:${env.PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

bootstrap();
