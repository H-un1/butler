import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// 모노레포 루트의 .env 강제 로드 (npm workspace cwd가 services/api-node로 바뀌어도 동작)
const here = path.dirname(fileURLToPath(import.meta.url));
const rootEnv = path.resolve(here, '../../../.env');
dotenv.config({ path: rootEnv });

import { isInMemoryDb, loadEnv } from './config/env.js';
import { buildApp } from './app.js';
import { getPrisma } from './db/client.js';
import { makeMockReportPdfClient } from './inspection/reportPipeline.js';
import { makeDevMockPgAdapter } from './subscription/pg.js';

const env = loadEnv();

const useInMemory = isInMemoryDb(env);

if (useInMemory && env.NODE_ENV === 'production') {
  throw new Error(
    'production 모드에서는 DATABASE_URL을 반드시 설정해야 합니다 (인메모리 금지)'
  );
}

const prisma = useInMemory ? null : getPrisma(env);

// dev 모드에서는 외부 의존성 없이 시연 가능하도록 mock pdf + dev-mock PG 자동 주입.
// 단 AI_BACKEND_BASE_URL이 설정돼 있으면 ai-python(FastAPI)에 실 PDF 호출을 위임.
const isDev = env.NODE_ENV !== 'production';
const useLiveAiBackend = Boolean(env.AI_BACKEND_BASE_URL);

const app = buildApp(env, {
  prisma,
  aiBackendBaseUrl: env.AI_BACKEND_BASE_URL,
  // useLiveAiBackend 인 경우 pdfClient를 undefined로 두면 app.ts가 HTTP client를 자동 구성.
  pdfClient: isDev && !useLiveAiBackend ? makeMockReportPdfClient() : undefined,
  pgAdapter: isDev ? makeDevMockPgAdapter() : undefined,
});

app.listen(env.PORT, () => {
  console.log(
    `[butler/api-node] http://localhost:${env.PORT} (env=${env.NODE_ENV}, db=${
      useInMemory ? 'in-memory' : 'prisma'
    }, ai=${useLiveAiBackend ? env.AI_BACKEND_BASE_URL : 'mock'})`
  );
});
