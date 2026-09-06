import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const createChannelSchema = z.object({
  serverId: z.string(),
  categoryId: z.string().optional(),
  name: z.string().min(1).max(50),
  type: z.enum(['TEXT', 'VOICE', 'NOTES', 'ANNOUNCEMENTS']).default('TEXT'),
  topic: z.string().optional(),
});

export const channelRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  // Create channel
  fastify.post('/', async (request, reply) => {
    const parse = createChannelSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', issues: parse.error.issues });
    }

    const { serverId, categoryId, name, type, topic } = parse.data;

    const channel = await fastify.prisma.channel.create({
      data: {
        serverId,
        categoryId: categoryId || null,
        name: name.toLowerCase().replace(/\s+/g, '-'),
        type,
        topic,
      },
    });

    return reply.status(201).send(channel);
  });

  // Delete channel
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    await fastify.prisma.channel.delete({
      where: { id },
    });

    return reply.send({ success: true, message: 'Canal eliminado' });
  });
};
