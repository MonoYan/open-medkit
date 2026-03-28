import { createMiddleware } from 'hono/factory';

export type AiEnv = {
  Variables: {
    aiApiKey: string;
    aiBaseUrl: string;
    aiModel: string;
  };
};

export const apiKeyMiddleware = createMiddleware<AiEnv>(async (c, next) => {
  const aiApiKey = process.env.AI_API_KEY || c.req.header('X-AI-Api-Key');

  if (!aiApiKey) {
    return c.json({ error: 'No API key configured' }, 400);
  }

  const aiBaseUrl =
    process.env.AI_BASE_URL ||
    c.req.header('X-AI-Base-Url') ||
    'https://api.openai.com';
  const aiModel = process.env.AI_MODEL || c.req.header('X-AI-Model') || 'gpt-4o-mini';

  c.set('aiApiKey', aiApiKey);
  c.set('aiBaseUrl', aiBaseUrl);
  c.set('aiModel', aiModel);

  await next();
});
