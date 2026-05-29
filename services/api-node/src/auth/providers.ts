import type { AuthProvider, Role } from '@butler/shared';

// === OAuth Provider 인터페이스 ===
// 실 카카오/네이버 어댑터(.env 키 채워지면 활성화) + dev-mock(NODE_ENV!=prod, ALLOW_DEV_AUTH_MOCK=true)

export type SocialIdentity = {
  provider: AuthProvider;
  providerUserId: string;
  name: string;
  phone: string | null;
  email: string | null;
};

export interface OAuthAdapter {
  readonly provider: AuthProvider;
  exchangeCodeForIdentity(code: string): Promise<SocialIdentity>;
}

// === Kakao ===

export function makeKakaoAdapter(opts: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): OAuthAdapter {
  return {
    provider: 'kakao',
    async exchangeCodeForIdentity(_code: string): Promise<SocialIdentity> {
      // 실 카카오 OAuth 토큰 교환은 키가 발급되는 즉시 여기에 구현된다.
      // M1에서는 인터페이스만 노출하고 .env 키가 비어있으면 server.ts에서 mock으로 폴백한다.
      void opts;
      throw new Error(
        'Kakao OAuth 실 어댑터 미구현 — 카카오 개발자센터 키 발급 후 구현 (M1 NEEDS CLARIFICATION).'
      );
    },
  };
}

export function makeNaverAdapter(opts: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): OAuthAdapter {
  return {
    provider: 'naver',
    async exchangeCodeForIdentity(_code: string): Promise<SocialIdentity> {
      void opts;
      throw new Error(
        'Naver OAuth 실 어댑터 미구현 — 네이버 개발자센터 키 발급 후 구현 (M1 NEEDS CLARIFICATION).'
      );
    },
  };
}

// === Dev-only mock ===
// 개발/테스트에서만 사용. 코드값으로 role 결정: code = "dev:LANDLORD" 등.
// production 빌드에서는 isDevMockAllowed()가 false라 server.ts에서 등록되지 않는다.

export function makeDevMockAdapter(): OAuthAdapter {
  return {
    provider: 'dev-mock',
    async exchangeCodeForIdentity(code: string): Promise<SocialIdentity> {
      // code 형식: "dev:<ROLE>:<NAME>" (NAME 생략 가능)
      const parts = code.split(':');
      if (parts.length < 2 || parts[0] !== 'dev') {
        throw new Error(
          `dev-mock 코드 형식 오류: "dev:<ROLE>[:<NAME>]" 이어야 합니다 (받음="${code}")`
        );
      }
      const role = parts[1] as Role;
      const name = parts[2] ?? `${role}_user`;
      return {
        provider: 'dev-mock',
        providerUserId: `${role}-${name}`,
        name,
        phone: null,
        email: null,
      };
    },
  };
}

// === PASS 본인인증 어댑터 ===
// ⚠️ 주민등록번호 등 고유식별정보는 절대 어댑터 내부에서도 저장하지 않는다.
//    인증 결과(verified=true) + verified_at 시각만 반환한다.

export type PassVerificationResult = {
  verified: true;
  verifiedAt: Date;
  // 본인 이름·연락처는 인증 시점의 결과 참조용. 주민번호는 절대 포함하지 않는다.
  name: string;
  phone: string;
};

export interface PassAdapter {
  readonly providerName: string;
  verify(input: { ci: string }): Promise<PassVerificationResult>;
}

export function makeDevMockPassAdapter(): PassAdapter {
  return {
    providerName: 'dev-mock',
    async verify(input: { ci: string }): Promise<PassVerificationResult> {
      if (!input.ci || input.ci.length < 4) {
        throw new Error('dev-mock PASS: 최소 4자 이상의 ci 토큰이 필요합니다');
      }
      return {
        verified: true,
        verifiedAt: new Date(),
        name: `mock-${input.ci.slice(0, 4)}`,
        phone: '010-0000-0000',
      };
    },
  };
}
