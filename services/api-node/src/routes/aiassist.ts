import { Router } from 'express';
import { z } from 'zod';
import { CHATBOT_TOPICS } from '@butler/shared';
import type { Env } from '../config/env.js';
import { requireAuth } from '../auth/rbac.js';
import type {
  ChatbotClient,
  OcrClient,
  PrecedentClient,
} from '../aiassist/clients.js';
import type {
  ChatbotLogRepository,
  OcrDocumentRepository,
} from '../aiassist/repository.js';

// ⚠️ 전부 mock. 외부 모델 호출 0. 주민번호 등 고유식별정보는 마스킹된 형태로만 다룬다.

const AskBody = z.object({
  question: z.string().min(1),
  topic: z.enum(CHATBOT_TOPICS).optional(),
});
const OcrBody = z.object({
  documentRef: z.string().optional(),
  rawText: z.string().optional(),
  marketPrice: z.number().int().positive().optional(),
});
const PrecedentBody = z.object({
  query: z.string().min(1),
  category: z.string().optional(),
});

// ---- 챗봇 (mock RAG) ----
export function buildChatbotRouter(
  env: Env,
  deps: { client: ChatbotClient; logRepo: ChatbotLogRepository }
): Router {
  const router = Router();
  const auth = requireAuth({ jwtSecret: env.JWT_SECRET });

  router.post('/ask', auth, async (req, res) => {
    const parsed = AskBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '요청 형식 오류', detail: parsed.error.issues });
      return;
    }
    let answer;
    try {
      answer = await deps.client.ask(parsed.data);
    } catch (err) {
      res.status(502).json({
        error: 'AI 챗봇 호출 실패 (ai-python 미가용)',
        detail: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    await deps.logRepo.log({
      userId: req.user!.sub,
      question: parsed.data.question,
      answer: answer.answer,
      topic: answer.topic,
    });
    res.json(answer);
  });

  router.get('/history', auth, async (req, res) => {
    const list = await deps.logRepo.listByUser(req.user!.sub);
    res.json(
      list.map((c) => ({
        id: c.id,
        question: c.question,
        answer: c.answer,
        topic: c.topic,
        mock: c.mock,
        createdAt: c.createdAt.toISOString(),
      }))
    );
  });

  return router;
}

// ---- OCR 등기부 (mock + 깡통전세 안전등급, 주민번호 마스킹/비저장) ----
export function buildOcrRouter(
  env: Env,
  deps: { client: OcrClient; docRepo: OcrDocumentRepository }
): Router {
  const router = Router();
  const auth = requireAuth({ jwtSecret: env.JWT_SECRET });

  router.post('/registry', auth, async (req, res) => {
    const parsed = OcrBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '요청 형식 오류', detail: parsed.error.issues });
      return;
    }
    let result;
    try {
      result = await deps.client.analyzeRegistry(parsed.data);
    } catch (err) {
      res.status(502).json({
        error: 'AI OCR 호출 실패 (ai-python 미가용)',
        detail: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    // 저장: 마스킹된 결과만 (주민번호 평문 비저장)
    const saved = await deps.docRepo.save({
      userId: req.user!.sub,
      address: result.address,
      ownerMasked: result.ownerMasked,
      safetyGrade: result.safetyGrade,
      safetyReason: result.safetyReason,
      totalDebt: result.totalDebt,
      marketPrice: parsed.data.marketPrice ?? null,
      result: { rights: result.rights, rrnMasked: result.rrnMasked },
    });
    res.json({ ...result, id: saved.id });
  });

  router.get('/history', auth, async (req, res) => {
    const list = await deps.docRepo.listByUser(req.user!.sub);
    res.json(
      list.map((o) => ({
        id: o.id,
        address: o.address,
        ownerMasked: o.ownerMasked,
        safetyGrade: o.safetyGrade,
        safetyReason: o.safetyReason,
        totalDebt: o.totalDebt,
        marketPrice: o.marketPrice,
        mock: o.mock,
        createdAt: o.createdAt.toISOString(),
      }))
    );
  });

  return router;
}

// ---- 판례 보조 (mock — 정산 보조) ----
export function buildPrecedentsRouter(
  env: Env,
  deps: { client: PrecedentClient }
): Router {
  const router = Router();
  const auth = requireAuth({ jwtSecret: env.JWT_SECRET });

  router.post('/search', auth, async (req, res) => {
    const parsed = PrecedentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '요청 형식 오류', detail: parsed.error.issues });
      return;
    }
    let result;
    try {
      result = await deps.client.search(parsed.data);
    } catch (err) {
      res.status(502).json({
        error: 'AI 판례 검색 호출 실패 (ai-python 미가용)',
        detail: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    res.json(result);
  });

  return router;
}
