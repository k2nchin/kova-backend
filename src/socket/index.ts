import { Server as SocketIOServer } from 'socket.io';
import { FastifyInstance } from 'fastify';

interface AuthSocketData {
  userId: string;
  email: string;
}

export function setupSocketIO(server: any, fastify: FastifyInstance) {
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // JWT Middleware for Socket authentication
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = fastify.jwt.verify<AuthSocketData>(token);
      socket.data.userId = decoded.userId;
      socket.data.email = decoded.email;
      next();
    } catch (err) {
      next(new Error('Invalid authentication token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.data.userId;
    console.log(`[Socket.IO] Usuario conectado: ${userId} (Socket ID: ${socket.id})`);

    // Broadcast online presence
    try {
      await fastify.prisma.user.update({
        where: { id: userId },
        data: { status: 'ONLINE' },
      });
      io.emit('user:presence', { userId, status: 'online' });
    } catch (err) {
      console.error('[Socket.IO] Error actualizando estado de usuario:', err);
    }

    // Join Channel Room
    socket.on('channel:join', ({ channelId }: { channelId: string }) => {
      socket.join(`channel:${channelId}`);
      console.log(`[Socket.IO] Socket ${socket.id} se unió al canal #${channelId}`);
    });

    // Leave Channel Room
    socket.on('channel:leave', ({ channelId }: { channelId: string }) => {
      socket.leave(`channel:${channelId}`);
    });

    // Send Message
    socket.on(
      'message:send',
      async ({
        channelId,
        content,
        replyToId,
      }: {
        channelId: string;
        content: string;
        replyToId?: string;
      }) => {
        try {
          if (!content?.trim()) return;

          const message = await fastify.prisma.message.create({
            data: {
              channelId,
              authorId: userId,
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

          // Broadcast to everyone in the channel (including sender)
          io.to(`channel:${channelId}`).emit('message:created', message);
        } catch (err) {
          console.error('[Socket.IO] Error creando mensaje:', err);
          socket.emit('error', { message: 'No se pudo enviar el mensaje' });
        }
      }
    );

    // Typing Indicators
    socket.on('typing:start', ({ channelId, username }: { channelId: string; username: string }) => {
      socket.to(`channel:${channelId}`).emit('channel:typing', { channelId, username, isTyping: true });
    });

    socket.on('typing:stop', ({ channelId, username }: { channelId: string; username: string }) => {
      socket.to(`channel:${channelId}`).emit('channel:typing', { channelId, username, isTyping: false });
    });

    // Disconnect
    socket.on('disconnect', async () => {
      console.log(`[Socket.IO] Usuario desconectado: ${userId}`);
      try {
        await fastify.prisma.user.update({
          where: { id: userId },
          data: { status: 'OFFLINE' },
        });
        io.emit('user:presence', { userId, status: 'offline' });
      } catch {}
    });
  });

  return io;
}
