import { z } from 'zod';

/**
 * Environment contract. Validated once at boot — a missing or malformed variable
 * fails the process immediately rather than surfacing as a null three screens in.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /**
   * Which responsibilities this process takes on. The API and the worker run
   * the same image; queue consumers and cron sweeps belong to the worker so
   * they run exactly once. 'all' is the single-process dev convenience.
   */
  ROLE: z.enum(['api', 'worker', 'all']).default('all'),
  PORT: z.coerce.number().int().positive().default(3000),

  // ── Database ───────────────────────────────────────────────────────────────
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(10),

  // ── Redis / queues ─────────────────────────────────────────────────────────
  REDIS_URL: z.string().url(),

  // ── Auth (consumed from Phase 1 onward) ────────────────────────────────────
  JWT_ACCESS_SECRET: z.string().min(16).default('dev_access_secret_change_me'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev_refresh_secret_change_me'),
  LINK_TOKEN_SECRET: z.string().min(16).default('dev_link_secret_change_me'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  // ── n8n email orchestration ────────────────────────────────────────────────
  // The API never opens an SMTP connection. It renders the message and hands it
  // to n8n, which delivers it and calls back with the outcome.
  N8N_WEBHOOK_URL: z.string().url().default('http://n8n:5678/webhook/vms-email'),
  N8N_CALLBACK_URL: z
    .string()
    .url()
    .default('http://api:3000/api/v1/webhooks/n8n/email-status'),
  VMS_WEBHOOK_SECRET: z.string().min(16).default('dev_n8n_shared_secret_change_me'),
  NOTIFICATIONS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  MAIL_FROM_NAME: z.string().default('Parinaam Foundation'),
  MAIL_FROM_EMAIL: z.string().email().default('noreply@parinaam.org'),

  /**
   * How OTHER containers reach this API — n8n fetches email attachments from
   * here. Container-network address, never exposed to browsers.
   */
  INTERNAL_API_URL: z.string().url().default('http://api:3000/api/v1'),

  // ── Storage ────────────────────────────────────────────────────────────────
  UPLOAD_DIR: z.string().default('/app/uploads'),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),

  // ── Web ────────────────────────────────────────────────────────────────────
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default('http://localhost:5174'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${detail}`);
  }

  return parsed.data;
}
