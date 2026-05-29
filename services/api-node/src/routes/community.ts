import { Router } from 'express';
import { z } from 'zod';
import { isValidRole } from '@butler/shared';
import type { Env } from '../config/env.js';
import { requireAuth } from '../auth/rbac.js';
import type { CommunityRepository } from '../community/repository.js';
import { canAccessComplex, complexesForUser } from '../community/membership.js';
import type { PropertyRepository } from '../properties/repository.js';
import type { LeaseRepository } from '../lease/repository.js';

const PostBody = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});
const CommentBody = z.object({ body: z.string().min(1) });

export type CommunityDeps = {
  communityRepo: CommunityRepository;
  propertyRepo: PropertyRepository;
  leaseRepo: LeaseRepository;
};

export function buildCommunityRouter(env: Env, deps: CommunityDeps): Router {
  const router = Router();
  const auth = requireAuth({ jwtSecret: env.JWT_SECRET });
  const gate = { propertyRepo: deps.propertyRepo, leaseRepo: deps.leaseRepo };

  // 내가 접근 가능한 단지 목록 ==================================================
  router.get('/my-complexes', auth, async (req, res) => {
    if (!isValidRole(req.user!.role)) {
      res.status(403).json({ error: '권한 없음' });
      return;
    }
    const set = await complexesForUser(req.user!.sub, req.user!.role, gate);
    res.json({ complexes: [...set] });
  });

  // 게시글 상세 + 댓글 (literal "posts" 먼저 등록) =============================
  router.get('/posts/:id', auth, async (req, res) => {
    const post = await deps.communityRepo.getPost(req.params.id);
    if (!post) {
      res.status(404).json({ error: '게시글 없음' });
      return;
    }
    const ok = await canAccessComplex(
      req.user!.sub,
      req.user!.role,
      post.complexName,
      gate
    );
    if (!ok) {
      res.status(403).json({ error: '해당 단지 실소유주/거주자만 접근 가능합니다' });
      return;
    }
    const comments = await deps.communityRepo.listComments(post.id);
    res.json({
      id: post.id,
      complexName: post.complexName,
      authorId: post.authorId,
      title: post.title,
      body: post.body,
      createdAt: post.createdAt.toISOString(),
      comments: comments.map((c) => ({
        id: c.id,
        authorId: c.authorId,
        body: c.body,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  });

  router.post('/posts/:id/comments', auth, async (req, res) => {
    const parsed = CommentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '요청 형식 오류', detail: parsed.error.issues });
      return;
    }
    const post = await deps.communityRepo.getPost(req.params.id);
    if (!post) {
      res.status(404).json({ error: '게시글 없음' });
      return;
    }
    const ok = await canAccessComplex(
      req.user!.sub,
      req.user!.role,
      post.complexName,
      gate
    );
    if (!ok) {
      res.status(403).json({ error: '해당 단지 실소유주/거주자만 댓글 가능합니다' });
      return;
    }
    const c = await deps.communityRepo.addComment({
      postId: post.id,
      authorId: req.user!.sub,
      body: parsed.data.body,
    });
    res.status(201).json({
      id: c.id,
      authorId: c.authorId,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    });
  });

  // 단지 게시판 — 목록/작성 (실소유주 게이트) ==================================
  router.get('/:complexName/posts', auth, async (req, res) => {
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
    const list = await deps.communityRepo.listPosts(req.params.complexName);
    res.json(
      list.map((p) => ({
        id: p.id,
        complexName: p.complexName,
        authorId: p.authorId,
        title: p.title,
        createdAt: p.createdAt.toISOString(),
      }))
    );
  });

  router.post('/:complexName/posts', auth, async (req, res) => {
    const parsed = PostBody.safeParse(req.body);
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
      res.status(403).json({ error: '해당 단지 실소유주/거주자만 게시 가능합니다' });
      return;
    }
    const post = await deps.communityRepo.createPost({
      complexName: req.params.complexName,
      authorId: req.user!.sub,
      title: parsed.data.title,
      body: parsed.data.body,
    });
    res.status(201).json({
      id: post.id,
      complexName: post.complexName,
      authorId: post.authorId,
      title: post.title,
      body: post.body,
      createdAt: post.createdAt.toISOString(),
    });
  });

  return router;
}
