import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const createMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  replyToId: z.string().optional(),
});

export const messageRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  // Get messages for a channel
  fastify.get('/channels/:channelId/messages', async (request, reply) => {
    const { channelId } = request.params as { channelId: string };
    const { cursor, limit = 50 } = request.query as { cursor?: string; limit?: number };

    const messages = await fastify.prisma.message.findMany({
      where: { channelId },
      take: Number(limit),
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'asc' },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            tag: true,
            avatarUrl: true,
          },
        },
        replyTo: {
          include: {
            author: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
        },
        reactions: true,
        attachments: true,
      },
    });

    return reply.send(messages);
  });

  // Send message to a channel (REST fallback if WebSocket is not used)
  fastify.post('/channels/:channelId/messages', async (request, reply) => {
    const { channelId } = request.params as { channelId: string };
    const parse = createMessageSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', issues: parse.error.issues });
    }

    const { content, replyToId } = parse.data;
    const authorId = request.user.userId;

    const message = await fastify.prisma.message.create({
      data: {
        channelId,
        authorId,
        content,
        replyToId: replyToId || null,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            tag: true,
            avatarUrl: true,
          },
        },
        replyTo: {
          include: {
            author: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
        },
        reactions: true,
        attachments: true,
      },
    });

    return reply.status(201).send(message);
  });

  // Toggle reaction
  fastify.post('/messages/:id/reactions', async (request, reply) => {
    const { id: messageId } = request.params as { id: string };
    const { emoji } = request.body as { emoji: string };
    const userId = request.user.userId;

    if (!emoji) {
      return reply.status(400).send({ error: 'Emoji is required' });
    }

    const existingReaction = await fastify.prisma.reaction.findUnique({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId,
          emoji,
        },
      },
    });

    if (existingReaction) {
      await fastify.prisma.reaction.delete({
        where: { id: existingReaction.id },
      });
      return reply.send({ action: 'removed', emoji });
    } else {
      await fastify.prisma.reaction.create({
        data: {
          messageId,
          userId,
          emoji,
        },
      });
      return reply.send({ action: 'added', emoji });
    }
  });

  // Delete message
  fastify.delete('/messages/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.userId;

    const message = await fastify.prisma.message.findUnique({
      where: { id },
    });

    if (!message) {
      return reply.status(404).send({ error: 'NotFound', message: 'Mensaje no encontrado' });
    }

    if (message.authorId !== userId) {
      return reply.status(403).send({ error: 'Forbidden', message: 'No puedes borrar este mensaje' });
    }

    await fastify.prisma.message.delete({
      where: { id },
    });

    return reply.send({ success: true, message: 'Mensaje eliminado' });
  });
};
