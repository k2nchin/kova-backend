import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const registerSchema = z.object({
  username: z.string().min(2).max(32),
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const googleAuthSchema = z.object({
  googleId: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  avatarUrl: z.string().optional(),
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Register with Email & Password
  fastify.post('/register', async (request, reply) => {
    const parse = registerSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', issues: parse.error.issues });
    }

    const { username, email, password, displayName } = parse.data;

    const existingUser = await fastify.prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      return reply.status(409).send({ error: 'Conflict', message: 'El usuario o correo ya está registrado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const tag = Math.floor(1000 + Math.random() * 9000).toString();

    const user = await fastify.prisma.user.create({
      data: {
        username,
        email,
        displayName: displayName || username,
        tag,
        passwordHash,
        status: 'ONLINE',
      },
    });

    const token = fastify.jwt.sign({ userId: user.id, email: user.email });

    return reply.status(201).send({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        tag: user.tag,
        avatarUrl: user.avatarUrl,
        customStatus: user.customStatus,
        status: user.status.toLowerCase(),
      },
      token,
    });
  });

  // Login with Email & Password
  fastify.post('/login', async (request, reply) => {
    const parse = loginSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', issues: parse.error.issues });
    }

    const { email, password } = parse.data;

    const user = await fastify.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.passwordHash) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Credenciales inválidas' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Credenciales inválidas' });
    }

    await fastify.prisma.user.update({
      where: { id: user.id },
      data: { status: 'ONLINE' },
    });

    const token = fastify.jwt.sign({ userId: user.id, email: user.email });

    return reply.send({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        tag: user.tag,
        avatarUrl: user.avatarUrl,
        customStatus: user.customStatus,
        status: 'online',
      },
      token,
    });
  });

  // Google OAuth Sync / Login
  fastify.post('/google', async (request, reply) => {
    const parse = googleAuthSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', issues: parse.error.issues });
    }

    const { googleId, email, displayName, avatarUrl } = parse.data;

    let user = await fastify.prisma.user.findFirst({
      where: {
        OR: [{ googleId }, { email }],
      },
    });

    if (!user) {
      const baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') || 'user';
      const tag = Math.floor(1000 + Math.random() * 9000).toString();

      user = await fastify.prisma.user.create({
        data: {
          googleId,
          email,
          username: `${baseUsername}_${Math.floor(100 + Math.random() * 900)}`,
          displayName,
          avatarUrl: avatarUrl || null,
          tag,
          status: 'ONLINE',
        },
      });
    } else if (!user.googleId) {
      user = await fastify.prisma.user.update({
        where: { id: user.id },
        data: { googleId, status: 'ONLINE', avatarUrl: user.avatarUrl || avatarUrl },
      });
    }

    const token = fastify.jwt.sign({ userId: user.id, email: user.email });

    return reply.send({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        tag: user.tag,
        avatarUrl: user.avatarUrl,
        customStatus: user.customStatus,
        status: 'online',
      },
      token,
    });
  });

  // Get current logged-in user profile
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = await fastify.prisma.user.findUnique({
      where: { id: request.user.userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        tag: true,
        avatarUrl: true,
        bannerUrl: true,
        bio: true,
        customStatus: true,
        status: true,
        twoFactorEnabled: true,
        createdAt: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'NotFound', message: 'Usuario no encontrado' });
    }

    return reply.send({
      ...user,
      status: user.status.toLowerCase(),
    });
  });
};
