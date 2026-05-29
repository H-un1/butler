import { createRequire } from 'node:module';
import type { PrismaClient } from '@prisma/client';
import type { Env } from '../config/env.js';

// 싱글톤 — 핫리로드 환경에서 connection 누수 방지.
declare global {
  // eslint-disable-next-line no-var
  var __butler_prisma: PrismaClient | undefined;
}

// @prisma/client는 CJS 패키지다. ESM 로더(tsx) 상단에서 정적 import 하면
// 인메모리 모드(DATABASE_URL 미설정, DB 미사용)에서도 불필요하게 로드돼
// CJS↔ESM 해석 오류를 낸다. 실제 DB가 설정돼 getPrisma가 호출될 때만
// native require(createRequire)로 지연 로드한다 — native require는 CJS 해석을
// 그대로 쓰므로 tsx의 확장자 추론 문제도 우회한다.
const nodeRequire = createRequire(import.meta.url);

export function getPrisma(env: Env): PrismaClient {
  if (!globalThis.__butler_prisma) {
    const { PrismaClient } = nodeRequire('@prisma/client') as {
      PrismaClient: new (opts?: unknown) => PrismaClient;
    };
    globalThis.__butler_prisma = new PrismaClient({
      datasources: { db: { url: env.DATABASE_URL } },
      log:
        env.NODE_ENV === 'development'
          ? ['warn', 'error']
          : ['error'],
    });
  }
  return globalThis.__butler_prisma;
}

export async function pingDb(prisma: PrismaClient): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
