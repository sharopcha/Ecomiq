import { z } from 'zod';

const envSchema = z.object({
  GATEWAY_INTERNAL_URL: z.string().url().default('http://localhost:3000/api'),
  STOREFRONT_URL: z.string().url().default('http://localhost:4300'),
  SESSION_COOKIE_SECURE: z.coerce.boolean().default(false),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // The marketing-service form record backing the footer newsletter signup —
  // must be created via the admin marketing forms UI first; subscribe is a
  // no-op (with a clear error) until this is set.
  NEWSLETTER_FORM_ID: z.string().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables', parsedEnv.error.format());
  throw new Error('Invalid environment variables');
}

export const env = parsedEnv.data;
