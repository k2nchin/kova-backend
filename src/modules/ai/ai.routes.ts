import { FastifyPluginAsync } from 'fastify';
import { env } from '../../config/env.js';

export const aiRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  // Kova AI Assistant prompt proxy
  fastify.post('/chat', async (request, reply) => {
    const { prompt, context } = request.body as {
      prompt: string;
      context?: { channelName?: string; serverName?: string; recentMessages?: string[] };
    };

    if (!prompt) {
      return reply.status(400).send({ error: 'Prompt is required' });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return reply.send({
        text: '✦ **Kova AI**: El servidor aún no tiene configurada la clave GEMINI_API_KEY en su archivo .env.',
      });
    }

    const systemInstruction = `Eres Kova AI, el asistente inteligente oficial de Kova (plataforma de comunicación, chat y voz WebRTC de alto rendimiento estilo Discord con estética cyberpunk). Responde en español, de forma concisa y útil.`;

    let enrichedPrompt = prompt;
    if (context?.channelName || context?.serverName || context?.recentMessages?.length) {
      const meta: string[] = [];
      if (context.serverName) meta.push(`Espacio/Servidor: ${context.serverName}`);
      if (context.channelName) meta.push(`Canal actual: #${context.channelName}`);
      if (context.recentMessages?.length) {
        meta.push(`Mensajes recientes del canal:\n${context.recentMessages.slice(-6).join('\n')}`);
      }
      enrichedPrompt = `[Contexto del canal]:\n${meta.join('\n')}\n\n[Pregunta o petición del usuario]:\n${prompt}`;
    }

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: 'user', parts: [{ text: enrichedPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return reply.status(500).send({
          text: '✦ **Kova AI**: Error al conectar con Google Gemini.',
          details: errJson,
        });
      }

      const data: any = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta';
      return reply.send({ text });
    } catch (err: any) {
      return reply.status(500).send({
        text: '✦ **Kova AI**: Excepción en el servicio de IA.',
        error: err.message,
      });
    }
  });
};
