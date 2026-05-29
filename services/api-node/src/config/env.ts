import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  // 빈 문자열 또는 "memory://" 이면 인메모리 모드 (dev 시연용).
  // production 안전장치는 server.ts에서 별도 검증.
  DATABASE_URL: z.string().default(''),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  KAKAO_OAUTH_CLIENT_ID: z.string().optional(),
  KAKAO_OAUTH_CLIENT_SECRET: z.string().optional(),
  KAKAO_OAUTH_REDIRECT_URI: z.string().optional(),
  NAVER_OAUTH_CLIENT_ID: z.string().optional(),
  NAVER_OAUTH_CLIENT_SECRET: z.string().optional(),
  NAVER_OAUTH_REDIRECT_URI: z.string().optional(),

  PASS_PROVIDER: z.string().optional(),
  PASS_API_KEY: z.string().optional(),
  PASS_API_SECRET: z.string().optional(),

  // ai-python(FastAPI) base URL. 설정 시 dev 모드에서도 실 PDF/ETL 호출.
  AI_BACKEND_BASE_URL: z.string().url().optional(),

  ALLOW_DEV_AUTH_MOCK: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n  ');
    throw new Error(`환경변수 검증 실패:\n  ${issues}`);
  }
  cached = result.data;
  return cached;
}

export function resetEnvCacheForTest(): void {
  cached = null;
}

export function isDevMockAllowed(env: Env): boolean {
  return env.NODE_ENV !== 'production' && env.ALLOW_DEV_AUTH_MOCK;
}

export function isInMemoryDb(env: Env): boolean {
  return !env.DATABASE_URL || env.DATABASE_URL === 'memory://';
}
