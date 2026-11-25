import 'dotenv/config';
import { z } from 'zod';

const environment = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  MAYA_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  MAYA_PUBLIC_KEY: z.string().optional().default(''),
  MAYA_SECRET_KEY: z.string().optional().default(''),
  MAYA_WEBHOOK_PUBLIC_KEY_1: z.string().optional().default(''),
  MAYA_WEBHOOK_PUBLIC_KEY_2: z.string().optional().default(''),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().trim().min(1).default('gemini-3.5-flash-lite'),
  AI_EXPLANATIONS: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000')
});

const parsed = environment.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
}

export const env = parsed.data;
