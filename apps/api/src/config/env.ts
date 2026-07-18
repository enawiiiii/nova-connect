import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_URL: z.string().default('http://localhost:5173').refine(
    (value) => value.split(',').every((origin) => URL.canParse(origin.trim())),
    'CLIENT_URL must contain valid comma-separated origins',
  ),
  APP_URL: z.string().url().default('http://localhost:4000'),
  SUPABASE_URL: z.string().url().default('https://placeholder.supabase.co'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).default('development-placeholder'),
  JWT_ACCESS_SECRET: z.string().min(32).default('development-access-secret-change-me-now'),
  JWT_REFRESH_SECRET: z.string().min(32).default('development-refresh-secret-change-me'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().max(400).default(400),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  REQUIRE_EMAIL_VERIFICATION: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  LOCAL_DEVELOPMENT_MODE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  LOCAL_DATA_PATH: z.string().default('.local/nova.json'),
  TURN_URL: z.string().optional(),
  TURN_SECRET: z.string().optional(),
  TURN_USERNAME: z.string().optional(),
  TURN_CREDENTIAL: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:connextnova@gmail.com'),
  BREVO_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('NOVA Connect <no-reply@example.com>'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
export const isLocalDevelopment = env.NODE_ENV !== 'production' && env.LOCAL_DEVELOPMENT_MODE;

if (env.NODE_ENV === 'production') {
  const insecureSecrets = [
    env.SUPABASE_SERVICE_ROLE_KEY === 'development-placeholder',
    env.JWT_ACCESS_SECRET.startsWith('development-'),
    env.JWT_REFRESH_SECRET.startsWith('development-'),
  ];
  if (insecureSecrets.some(Boolean)) throw new Error('Production secrets are required');
  if (!env.COOKIE_SECURE) throw new Error('COOKIE_SECURE must be true in production');
  if (env.COOKIE_SAME_SITE === 'none' && !env.COOKIE_SECURE) throw new Error('SameSite=None cookies must be secure');
  if (!env.CLIENT_URL.split(',').every((origin) => origin.trim().startsWith('https://'))) throw new Error('CLIENT_URL must use HTTPS in production');
  const hasSmtp = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
  if (env.REQUIRE_EMAIL_VERIFICATION && !env.BREVO_API_KEY && !hasSmtp) {
    throw new Error('BREVO_API_KEY or SMTP credentials are required in production for email verification');
  }
  if (env.TURN_URL && !env.TURN_SECRET && !(env.TURN_USERNAME && env.TURN_CREDENTIAL)) {
    throw new Error('TURN_URL requires TURN_SECRET or TURN_USERNAME and TURN_CREDENTIAL');
  }
}
