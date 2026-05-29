import express, { type Express } from 'express';
import cors from 'cors';
import type { PrismaClient } from '@prisma/client';
import type { Env } from './config/env.js';
import { buildHealthRouter } from './routes/health.js';
import { buildAuthRouter } from './routes/auth.js';
import { buildMeRouter } from './routes/me.js';
import { buildPropertiesRouter } from './routes/properties.js';
import { buildHouseLogRouter } from './routes/houseLog.js';
import { buildInspectionsRouter } from './routes/inspections.js';
import { buildSubscriptionsRouter } from './routes/subscriptions.js';
import { buildAdminRouter } from './routes/admin.js';
import {
  makeInMemorySubscriptionRepository,
  makePrismaSubscriptionRepository,
  type SubscriptionRepository,
} from './subscription/repository.js';
import {
  makeDevMockPgAdapter,
  makeHttpPgAdapter,
  type PgAdapter,
} from './subscription/pg.js';
import { isDevMockAllowed } from './config/env.js';
import {
  makeInMemoryPropertyRepository,
  makePrismaPropertyRepository,
  type PropertyRepository,
} from './properties/repository.js';
import {
  makeHttpEnrichClient,
  type EnrichClient,
} from './properties/enrich.js';
import {
  makeInMemoryHouseLogRepository,
  makePrismaHouseLogRepository,
  type HouseLogRepository,
} from './houseLog/repository.js';
import {
  makeInMemoryInspectionRepository,
  makePrismaInspectionRepository,
  type InspectionRepository,
} from './inspection/repository.js';
import {
  makeHttpReportPdfClient,
  type ReportPdfClient,
} from './inspection/reportPipeline.js';
import { makeInMemoryUserStore, type UserStore } from './auth/userStore.js';
import { buildReportsRouter } from './routes/reports.js';
import {
  makeInMemoryLeaseRepository,
  makePrismaLeaseRepository,
  type LeaseRepository,
} from './lease/repository.js';
import {
  makeInMemoryMaintenanceRepository,
  makePrismaMaintenanceRepository,
  type MaintenanceRepository,
} from './maintenance/repository.js';
import { buildLeasesRouter } from './routes/leases.js';
import { buildMaintenanceRouter } from './routes/maintenance.js';
import {
  makeInMemorySettlementRepository,
  makePrismaSettlementRepository,
  type SettlementRepository,
} from './settlement/repository.js';
import {
  makeHttpSettlementEngine,
  makeLocalSettlementEngine,
  type SettlementEngine,
} from './settlement/engineClient.js';
import { buildSettlementsRouter } from './routes/settlements.js';
import {
  makeInMemoryNotificationRepository,
  makePrismaNotificationRepository,
  type NotificationRepository,
} from './notification/repository.js';
import {
  makeMockNotificationSender,
  makeNotificationService,
  type NotificationService,
} from './notification/sender.js';
import {
  makeInMemoryPaymentRepository,
  makePrismaPaymentRepository,
  type PaymentRepository,
} from './payment/repository.js';
import {
  makeMockPaymentGateway,
  makeHttpPaymentGateway,
  type PaymentGateway,
} from './payment/gateway.js';
import { buildNotificationsRouter } from './routes/notifications.js';
import { buildPaymentsRouter } from './routes/payments.js';
import { buildCrmRouter } from './routes/crm.js';
import {
  makeInMemoryCommunityRepository,
  makePrismaCommunityRepository,
  type CommunityRepository,
} from './community/repository.js';
import {
  makeInMemoryVoteRepository,
  makePrismaVoteRepository,
  type VoteRepository,
} from './vote/repository.js';
import { buildCommunityRouter } from './routes/community.js';
import { buildVotesRouter } from './routes/votes.js';
import {
  makeInMemoryVendorRepository,
  makePrismaVendorRepository,
  type VendorRepository,
} from './vendor/repository.js';
import { buildVendorsRouter } from './routes/vendors.js';
import {
  makeLocalChatbotClient,
  makeHttpChatbotClient,
  makeLocalOcrClient,
  makeHttpOcrClient,
  makeLocalPrecedentClient,
  makeHttpPrecedentClient,
  type ChatbotClient,
  type OcrClient,
  type PrecedentClient,
} from './aiassist/clients.js';
import {
  makeInMemoryChatbotLogRepository,
  makePrismaChatbotLogRepository,
  makeInMemoryOcrDocumentRepository,
  makePrismaOcrDocumentRepository,
  type ChatbotLogRepository,
  type OcrDocumentRepository,
} from './aiassist/repository.js';
import {
  buildChatbotRouter,
  buildOcrRouter,
  buildPrecedentsRouter,
} from './routes/aiassist.js';

export type AppDeps = {
  prisma?: PrismaClient | null;
  propertyRepo?: PropertyRepository;
  enrichClient?: EnrichClient | null;
  aiBackendBaseUrl?: string;
  houseLogRepo?: HouseLogRepository;
  inspectionRepo?: InspectionRepository;
  pdfClient?: ReportPdfClient | null;
  subscriptionRepo?: SubscriptionRepository;
  pgAdapter?: PgAdapter | null;
  userStore?: UserStore;
  leaseRepo?: LeaseRepository;
  maintenanceRepo?: MaintenanceRepository;
  settlementRepo?: SettlementRepository;
  settlementEngine?: SettlementEngine;
  notificationRepo?: NotificationRepository;
  notificationService?: NotificationService;
  paymentRepo?: PaymentRepository;
  paymentGateway?: PaymentGateway;
  communityRepo?: CommunityRepository;
  voteRepo?: VoteRepository;
  vendorRepo?: VendorRepository;
  chatbotClient?: ChatbotClient;
  ocrClient?: OcrClient;
  precedentClient?: PrecedentClient;
  chatbotLogRepo?: ChatbotLogRepository;
  ocrDocumentRepo?: OcrDocumentRepository;
};

export function buildApp(env: Env, deps: AppDeps = {}): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cors());

  const propertyRepo =
    deps.propertyRepo ??
    (deps.prisma
      ? makePrismaPropertyRepository(deps.prisma)
      : makeInMemoryPropertyRepository());

  const enrichClient: EnrichClient | null =
    deps.enrichClient !== undefined
      ? deps.enrichClient
      : deps.aiBackendBaseUrl
      ? makeHttpEnrichClient(deps.aiBackendBaseUrl)
      : null;

  const houseLogRepo =
    deps.houseLogRepo ??
    (deps.prisma
      ? makePrismaHouseLogRepository(deps.prisma)
      : makeInMemoryHouseLogRepository());

  const inspectionRepo =
    deps.inspectionRepo ??
    (deps.prisma
      ? makePrismaInspectionRepository(deps.prisma)
      : makeInMemoryInspectionRepository());

  const pdfClient: ReportPdfClient | null =
    deps.pdfClient !== undefined
      ? deps.pdfClient
      : deps.aiBackendBaseUrl
      ? makeHttpReportPdfClient(deps.aiBackendBaseUrl)
      : null;

  const userStore: UserStore = deps.userStore ?? makeInMemoryUserStore();

  app.use('/health', buildHealthRouter(deps.prisma ?? null));
  app.use('/auth', buildAuthRouter(env, { userStore }));
  app.use('/me', buildMeRouter(env));
  app.use(
    '/properties',
    buildPropertiesRouter(env, { repo: propertyRepo, enrichClient })
  );
  app.use(
    '/properties/:propertyId/house-log',
    buildHouseLogRouter(env, { houseLogRepo, propertyRepo })
  );
  app.use(
    '/inspections',
    buildInspectionsRouter(env, {
      inspectionRepo,
      propertyRepo,
      houseLogRepo,
      pdfClient,
      userStore,
    })
  );
  app.use(
    '/reports',
    buildReportsRouter(env, {
      inspectionRepo,
      propertyRepo,
      aiBackendBaseUrl: deps.aiBackendBaseUrl ?? null,
    })
  );

  const subscriptionRepo =
    deps.subscriptionRepo ??
    (deps.prisma
      ? makePrismaSubscriptionRepository(deps.prisma)
      : makeInMemorySubscriptionRepository());

  const pgAdapter: PgAdapter | null =
    deps.pgAdapter !== undefined
      ? deps.pgAdapter
      : env.NODE_ENV !== 'test'
      ? makeHttpPgAdapter({ provider: 'http-stub', secretKey: '' })
      : isDevMockAllowed(env)
      ? makeDevMockPgAdapter()
      : null;

  app.use(
    '/subscriptions',
    buildSubscriptionsRouter(env, { propertyRepo, subscriptionRepo, pgAdapter })
  );
  app.use(
    '/admin',
    buildAdminRouter(env, { propertyRepo, subscriptionRepo, userStore })
  );

  // === Phase 2 (M1) — Lease + 수선요청 이슈보드 ===
  const leaseRepo =
    deps.leaseRepo ??
    (deps.prisma
      ? makePrismaLeaseRepository(deps.prisma)
      : makeInMemoryLeaseRepository());

  const maintenanceRepo =
    deps.maintenanceRepo ??
    (deps.prisma
      ? makePrismaMaintenanceRepository(deps.prisma)
      : makeInMemoryMaintenanceRepository());

  // === Phase 2 (M3) — 알림 인프라 (정산·수선 흐름에 주입) ===
  const notificationRepo =
    deps.notificationRepo ??
    (deps.prisma
      ? makePrismaNotificationRepository(deps.prisma)
      : makeInMemoryNotificationRepository());

  // 발송은 mock(카카오/SMS 실 호출 0). 인앱은 항상 적재.
  const notificationService: NotificationService =
    deps.notificationService ??
    makeNotificationService(notificationRepo, makeMockNotificationSender());

  app.use(
    '/leases',
    buildLeasesRouter(env, { leaseRepo, propertyRepo, houseLogRepo })
  );
  app.use(
    '/maintenance',
    buildMaintenanceRouter(env, {
      maintenanceRepo,
      leaseRepo,
      propertyRepo,
      houseLogRepo,
      notificationService,
      userStore,
    })
  );

  // === Phase 2 (M2) — 수선비 정산 + 양측 합의 ===
  const settlementRepo =
    deps.settlementRepo ??
    (deps.prisma
      ? makePrismaSettlementRepository(deps.prisma)
      : makeInMemorySettlementRepository());

  // 정산 엔진: ai-python이 정식 호스트, 미설정 시 로컬 룰 엔진(실제 계산)으로 폴백.
  const settlementEngine: SettlementEngine =
    deps.settlementEngine ??
    (deps.aiBackendBaseUrl
      ? makeHttpSettlementEngine(deps.aiBackendBaseUrl)
      : makeLocalSettlementEngine());

  app.use(
    '/settlements',
    buildSettlementsRouter(env, {
      settlementRepo,
      leaseRepo,
      inspectionRepo,
      houseLogRepo,
      engine: settlementEngine,
      notificationService,
      userStore,
    })
  );

  // === Phase 2 (M3) — 결제(mock PG) + 알림센터 + CRM ===
  const paymentRepo =
    deps.paymentRepo ??
    (deps.prisma
      ? makePrismaPaymentRepository(deps.prisma)
      : makeInMemoryPaymentRepository());

  // mock PG — 실 결제 0. 실 키(PG_SECRET_KEY) 발급 시 http 어댑터로 교체.
  const paymentGateway: PaymentGateway =
    deps.paymentGateway ??
    (env.NODE_ENV !== 'test'
      ? makeMockPaymentGateway()
      : makeMockPaymentGateway());

  app.use(
    '/notifications',
    buildNotificationsRouter(env, {
      notificationRepo,
      notificationService,
      leaseRepo,
      paymentRepo,
    })
  );
  app.use(
    '/payments',
    buildPaymentsRouter(env, {
      paymentRepo,
      gateway: paymentGateway,
      settlementRepo,
      subscriptionRepo,
      leaseRepo,
      houseLogRepo,
      notificationService,
    })
  );
  app.use(
    '/crm',
    buildCrmRouter(env, {
      leaseRepo,
      propertyRepo,
      paymentRepo,
      maintenanceRepo,
      settlementRepo,
      userStore,
    })
  );

  // === Phase 3 (M4) — 단지 커뮤니티 · 전자투표 · 보수업체 ===
  const communityRepo =
    deps.communityRepo ??
    (deps.prisma
      ? makePrismaCommunityRepository(deps.prisma)
      : makeInMemoryCommunityRepository());
  const voteRepo =
    deps.voteRepo ??
    (deps.prisma
      ? makePrismaVoteRepository(deps.prisma)
      : makeInMemoryVoteRepository());
  const vendorRepo =
    deps.vendorRepo ??
    (deps.prisma
      ? makePrismaVendorRepository(deps.prisma)
      : makeInMemoryVendorRepository());

  app.use(
    '/community',
    buildCommunityRouter(env, { communityRepo, propertyRepo, leaseRepo })
  );
  app.use('/votes', buildVotesRouter(env, { voteRepo, propertyRepo, leaseRepo }));
  app.use('/vendors', buildVendorsRouter(env, { vendorRepo }));

  // === Phase 3 (M5) — AI 보조 (전부 mock) ===
  // ai-python이 정식 호스트(mock 엔진), 미설정 시 로컬 mock으로 폴백. 둘 다 mock(실 모델 0).
  const chatbotClient =
    deps.chatbotClient ??
    (deps.aiBackendBaseUrl
      ? makeHttpChatbotClient(deps.aiBackendBaseUrl)
      : makeLocalChatbotClient());
  const ocrClient =
    deps.ocrClient ??
    (deps.aiBackendBaseUrl
      ? makeHttpOcrClient(deps.aiBackendBaseUrl)
      : makeLocalOcrClient());
  const precedentClient =
    deps.precedentClient ??
    (deps.aiBackendBaseUrl
      ? makeHttpPrecedentClient(deps.aiBackendBaseUrl)
      : makeLocalPrecedentClient());
  const chatbotLogRepo =
    deps.chatbotLogRepo ??
    (deps.prisma
      ? makePrismaChatbotLogRepository(deps.prisma)
      : makeInMemoryChatbotLogRepository());
  const ocrDocumentRepo =
    deps.ocrDocumentRepo ??
    (deps.prisma
      ? makePrismaOcrDocumentRepository(deps.prisma)
      : makeInMemoryOcrDocumentRepository());

  app.use(
    '/chatbot',
    buildChatbotRouter(env, { client: chatbotClient, logRepo: chatbotLogRepo })
  );
  app.use('/ocr', buildOcrRouter(env, { client: ocrClient, docRepo: ocrDocumentRepo }));
  app.use(
    '/precedents',
    buildPrecedentsRouter(env, { client: precedentClient })
  );

  app.use((_, res) => {
    res.status(404).json({ error: '경로를 찾을 수 없습니다' });
  });

  return app;
}
