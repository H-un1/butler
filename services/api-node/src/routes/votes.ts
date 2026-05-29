import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import { requireAuth } from '../auth/rbac.js';
import {
  tally,
  type VoteRecord,
  type VoteRepository,
} from '../vote/repository.js';
import { canAccessComplex } from '../community/membership.js';
import type { PropertyRepository } from '../properties/repository.js';
import type { LeaseRepository } from '../lease/repository.js';

const CreateBody = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  options: z.array(z.string().min(1)).min(2),
  closesAt: z.string().datetime().optional(),
});
const CastBody = z.object({ optionIndex: z.number().int().nonnegative() });

export type VotesDeps = {
  voteRepo: VoteRepository;
  propertyRepo: PropertyRepository;
  leaseRepo: LeaseRepository;
};

export function buildVotesRouter(env: Env, deps: VotesDeps): Router {
  const router = Router();
  const auth = requireAuth({ jwtSecret: env.JWT_SECRET });
  const gate = { propertyRepo: deps.propertyRepo, leaseRepo: deps.leaseRepo };

  async function dtoWithTally(v: VoteRecord, voterId: string) {
    const ballots = await deps.voteRepo.listBallots(v.id);
    const myBallot = ballots.find((b) => b.voterId === voterId);
    return {
      id: v.id,
      complexName: v.complexName,
      creatorId: v.creatorId,
      title: v.title,
      description: v.description,
      options: v.options,
      status: v.status,
      closesAt: v.closesAt ? v.closesAt.toISOString() : null,
      createdAt: v.createdAt.toISOString(),
      totalBallots: ballots.length,
      tally: tally(v.options, ballots),
      myOptionIndex: myBallot ? myBallot.optionIndex : null,
    };
  }

  // 투표 상세 + 집계 (literal "v" 먼저) ========================================
  router.get('/v/:id', auth, async (req, res) => {
    const v = await deps.voteRepo.getVote(req.params.id);
    if (!v) {
      res.status(404).json({ error: '투표 없음' });
      return;
    }
    const ok = await canAccessComplex(req.user!.sub, req.user!.role, v.complexName, gate);
    if (!ok) {
      res.status(403).json({ error: '해당 단지 실소유주/거주자만 접근 가능합니다' });
      return;
    }
    res.json(await dtoWithTally(v, req.user!.sub));
  });

  // 투표 (1인 1표) =============================================================
  router.post('/v/:id/cast', auth, async (req, res) => {
    const parsed = CastBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '요청 형식 오류', detail: parsed.error.issues });
      return;
    }
    const v = await deps.voteRepo.getVote(req.params.id);
    if (!v) {
      res.status(404).json({ error: '투표 없음' });
      return;
    }
    const ok = await canAccessComplex(req.user!.sub, req.user!.role, v.complexName, gate);
    if (!ok) {
      res.status(403).json({ error: '해당 단지 실소유주/거주자만 투표 가능합니다' });
      return;
    }
    if (v.status !== 'OPEN') {
      res.status(409).json({ error: '마감된 투표입니다' });
      return;
    }
    if (parsed.data.optionIndex >= v.options.length) {
      res.status(400).json({ error: '유효하지 않은 선택지입니다' });
      return;
    }
    const existing = await deps.voteRepo.getBallot(v.id, req.user!.sub);
    if (existing) {
      res.status(409).json({ error: '이미 투표했습니다 (1인 1표)' });
      return;
    }
    await deps.voteRepo.castBallot({
      voteId: v.id,
      voterId: req.user!.sub,
      optionIndex: parsed.data.optionIndex,
    });
    res.status(201).json(await dtoWithTally(v, req.user!.sub));
  });

  // 투표 마감 — 생성자만 ========================================================
  router.post('/v/:id/close', auth, async (req, res) => {
    const v = await deps.voteRepo.getVote(req.params.id);
    if (!v) {
      res.status(404).json({ error: '투표 없음' });
      return;
    }
    if (v.creatorId !== req.user!.sub) {
      res.status(403).json({ error: '투표 생성자만 마감할 수 있습니다' });
      return;
    }
    const closed = await deps.voteRepo.closeVote(v.id);
    res.json(await dtoWithTally(closed, req.user!.sub));
  });

  // 단지 투표 목록 / 생성 ======================================================
  router.get('/:complexName', auth, async (req, res) => {
    const ok = await canAccessComplex(
      req.user!.sub,
      req.user!.role,
      req.params.complexName,
      gate
    );
    if (!ok) {
      res.status(403).json({ error: '해당 단지 실소유주/거주자만 접근 가능합니다' });
      return;
    }
    const list = await deps.voteRepo.listVotes(req.params.complexName);
    const dtos = [];
    for (const v of list) dtos.push(await dtoWithTally(v, req.user!.sub));
    res.json(dtos);
  });

  router.post('/:complexName', auth, async (req, res) => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '요청 형식 오류', detail: parsed.error.issues });
      return;
    }
    const ok = await canAccessComplex(
      req.user!.sub,
      req.user!.role,
      req.params.complexName,
      gate
    );
    if (!ok) {
      res.status(403).json({ error: '해당 단지 실소유주/거주자만 투표 생성 가능합니다' });
      return;
    }
    const v = await deps.voteRepo.createVote({
      complexName: req.params.complexName,
      creatorId: req.user!.sub,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      options: parsed.data.options,
      closesAt: parsed.data.closesAt ? new Date(parsed.data.closesAt) : null,
    });
    res.status(201).json(await dtoWithTally(v, req.user!.sub));
  });

  return router;
}
