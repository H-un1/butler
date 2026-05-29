import { Router } from 'express';
import { z } from 'zod';
import { ALL_ROLES, isValidRole, type Role } from '@butler/shared';
import { isDevMockAllowed, type Env } from '../config/env.js';
import { signSession } from '../auth/jwt.js';
import {
  makeDevMockAdapter,
  makeDevMockPassAdapter,
  makeKakaoAdapter,
  makeNaverAdapter,
  type OAuthAdapter,
  type PassAdapter,
} from '../auth/providers.js';
import { makeInMemoryUserStore, type UserStore } from '../auth/userStore.js';

const ExchangeBody = z.object({
  provider: z.enum(['kakao', 'naver', 'dev-mock']),
  code: z.string().min(1),
  role: z.string(),
});

const PassBody = z.object({
  ci: z.string().min(4),
});

export type AuthRouterDeps = {
  oauthAdapters: Map<string, OAuthAdapter>;
  passAdapter: PassAdapter | null;
  userStore: UserStore;
};

export function buildAuthRouter(env: Env, deps?: Partial<AuthRouterDeps>): Router {
  const router = Router();

  const oauthAdapters: Map<string, OAuthAdapter> = deps?.oauthAdapters ?? new Map();
  if (!deps?.oauthAdapters) {
    if (env.KAKAO_OAUTH_CLIENT_ID && env.KAKAO_OAUTH_CLIENT_SECRET && env.KAKAO_OAUTH_REDIRECT_URI) {
      oauthAdapters.set(
        'kakao',
        makeKakaoAdapter({
          clientId: env.KAKAO_OAUTH_CLIENT_ID,
          clientSecret: env.KAKAO_OAUTH_CLIENT_SECRET,
          redirectUri: env.KAKAO_OAUTH_REDIRECT_URI,
        })
      );
    }
    if (env.NAVER_OAUTH_CLIENT_ID && env.NAVER_OAUTH_CLIENT_SECRET && env.NAVER_OAUTH_REDIRECT_URI) {
      oauthAdapters.set(
        'naver',
        makeNaverAdapter({
          clientId: env.NAVER_OAUTH_CLIENT_ID,
          clientSecret: env.NAVER_OAUTH_CLIENT_SECRET,
          redirectUri: env.NAVER_OAUTH_REDIRECT_URI,
        })
      );
    }
    if (isDevMockAllowed(env)) {
      oauthAdapters.set('dev-mock', makeDevMockAdapter());
    }
  }

  const passAdapter: PassAdapter | null =
    deps?.passAdapter !== undefined
      ? deps.passAdapter
      : isDevMockAllowed(env) && !env.PASS_API_KEY
      ? makeDevMockPassAdapter()
      : null;

  const userStore: UserStore = deps?.userStore ?? makeInMemoryUserStore();

  router.post('/exchange', async (req, res) => {
    const parsed = ExchangeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '요청 형식 오류', detail: parsed.error.issues });
      return;
    }
    const { provider, code, role } = parsed.data;
    if (!isValidRole(role)) {
      res.status(400).json({
        error: `유효하지 않은 role: ${role} (허용: ${ALL_ROLES.join(', ')})`,
      });
      return;
    }
    const adapter = oauthAdapters.get(provider);
    if (!adapter) {
      res.status(400).json({
        error: `${provider} 어댑터가 등록되지 않았습니다 — .env 키 또는 ALLOW_DEV_AUTH_MOCK 확인`,
      });
      return;
    }
    try {
      const identity = await adapter.exchangeCodeForIdentity(code);
      const existing = await userStore.findByProviderId(
        identity.provider,
        identity.providerUserId
      );
      const user =
        existing ??
        (await userStore.createWithRole({
          role: role as Role,
          name: identity.name,
          phone: identity.phone,
          email: identity.email,
          authProvider: identity.provider,
          providerUserId: identity.providerUserId,
        }));
      if (existing && existing.role !== role) {
        res.status(409).json({
          error: `이미 ${existing.role} 역할로 가입된 계정입니다`,
        });
        return;
      }
      const token = signSession(
        {
          sub: user.id,
          role: user.role,
          verified: user.verifiedAt !== null,
        },
        env.JWT_SECRET,
        env.JWT_EXPIRES_IN
      );
      res.json({
        token,
        user: {
          id: user.id,
          role: user.role,
          name: user.name,
          verified: user.verifiedAt !== null,
        },
      });
    } catch (err) {
      res.status(502).json({
        error: 'OAuth 어댑터 호출 실패',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  router.post('/pass/verify', async (req, res) => {
    if (!passAdapter) {
      res.status(503).json({
        error:
          'PASS 어댑터가 등록되지 않았습니다 — PASS_API_KEY 또는 dev-mock 활성화 확인',
      });
      return;
    }
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Bearer 세션 토큰이 필요합니다' });
      return;
    }
    const parsed = PassBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '요청 형식 오류', detail: parsed.error.issues });
      return;
    }
    try {
      const result = await passAdapter.verify({ ci: parsed.data.ci });
      // 본인 인증 통과 → verified_at 갱신. 주민번호는 결과에도 저장하지 않는다.
      // 실제 user id는 verifySession 후 갱신 — 여기는 단순화 인터페이스
      res.json({
        verified: true,
        verifiedAt: result.verifiedAt.toISOString(),
        provider: passAdapter.providerName,
      });
    } catch (err) {
      res.status(502).json({
        error: 'PASS 어댑터 호출 실패',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
}
