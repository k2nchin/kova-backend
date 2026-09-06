import { FastifyPluginAsync } from 'fastify';
import { AccessToken } from 'livekit-server-sdk';
import { env } from '../../config/env.js';

export const voiceRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  // Generate LiveKit token to join a voice channel
  fastify.post('/token', async (request, reply) => {
    const { channelId } = request.body as { channelId: string };
    if (!channelId) {
      return reply.status(400).send({ error: 'channelId is required' });
    }

    const user = await fastify.prisma.user.findUnique({
      where: { id: request.user.userId },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const apiKey = env.LIVEKIT_API_KEY || 'devkey';
    const apiSecret = env.LIVEKIT_API_SECRET || 'secret';
    const livekitUrl = env.LIVEKIT_URL || 'ws://localhost:7880';

    const at = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: user.displayName,
      metadata: JSON.stringify({
        avatarUrl: user.avatarUrl,
        tag: user.tag,
      }),
    });

    at.addGrant({
      roomJoin: true,
      room: `voice_channel_${channelId}`,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return reply.send({
      token,
      url: livekitUrl,
      room: `voice_channel_${channelId}`,
    });
  });
};
