import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const createServerSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  iconUrl: z.string().optional(),
});

export const serverRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  // Get user's servers
  fastify.get('/', async (request, reply) => {
    const userId = request.user.userId;

    const memberships = await fastify.prisma.serverMember.findMany({
      where: { userId },
      include: {
        server: {
          include: {
            categories: {
              orderBy: { position: 'asc' },
            },
            channels: {
              orderBy: { position: 'asc' },
            },
            roles: {
              orderBy: { position: 'asc' },
            },
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    tag: true,
                    avatarUrl: true,
                    status: true,
                    customStatus: true,
                  },
                },
                roles: true,
              },
            },
          },
        },
      },
    });

    const servers = memberships.map((m) => m.server);
    return reply.send(servers);
  });

  // Create new server
  fastify.post('/', async (request, reply) => {
    const parse = createServerSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', issues: parse.error.issues });
    }

    const { name, description, iconUrl } = parse.data;
    const userId = request.user.userId;
    const acronym = name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 3)
      .toUpperCase();

    // Transaction to create Server, Member (Owner), Default Role, Category and Channels
    const server = await fastify.prisma.$transaction(async (tx) => {
      const newServer = await tx.server.create({
        data: {
          name,
          description,
          iconUrl,
          acronym,
          ownerId: userId,
        },
      });

      // Default @everyone role
      const everyoneRole = await tx.role.create({
        data: {
          serverId: newServer.id,
          name: '@everyone',
          color: '#99AAB5',
          hoist: false,
          position: 0,
          permissions: JSON.stringify(['VIEW_CHANNEL', 'SEND_MESSAGES', 'CONNECT_VOICE', 'SPEAK_VOICE']),
        },
      });

      // Member (Owner)
      const member = await tx.serverMember.create({
        data: {
          serverId: newServer.id,
          userId,
        },
      });

      // Default category
      const textCat = await tx.category.create({
        data: {
          serverId: newServer.id,
          name: 'CANALES DE TEXTO',
          position: 0,
        },
      });

      const voiceCat = await tx.category.create({
        data: {
          serverId: newServer.id,
          name: 'CANALES DE VOZ',
          position: 1,
        },
      });

      // Default channels
      await tx.channel.createMany({
        data: [
          {
            serverId: newServer.id,
            categoryId: textCat.id,
            name: 'general',
            type: 'TEXT',
            position: 0,
          },
          {
            serverId: newServer.id,
            categoryId: textCat.id,
            name: 'anuncios',
            type: 'ANNOUNCEMENTS',
            position: 1,
          },
          {
            serverId: newServer.id,
            categoryId: voiceCat.id,
            name: 'General',
            type: 'VOICE',
            position: 0,
          },
        ],
      });

      return tx.server.findUnique({
        where: { id: newServer.id },
        include: {
          categories: true,
          channels: true,
          roles: true,
          members: {
            include: {
              user: true,
            },
          },
        },
      });
    });

    return reply.status(201).send(server);
  });

  // Join Server by ID
  fastify.post('/:id/join', async (request, reply) => {
    const { id: serverId } = request.params as { id: string };
    const userId = request.user.userId;

    const server = await fastify.prisma.server.findUnique({
      where: { id: serverId },
    });

    if (!server) {
      return reply.status(404).send({ error: 'NotFound', message: 'Servidor no encontrado' });
    }

    const existingMember = await fastify.prisma.serverMember.findUnique({
      where: {
        serverId_userId: { serverId, userId },
      },
    });

    if (existingMember) {
      return reply.send({ message: 'Ya eres miembro de este servidor' });
    }

    await fastify.prisma.serverMember.create({
      data: {
        serverId,
        userId,
      },
    });

    return reply.send({ message: 'Te has unido al servidor con éxito' });
  });
};
