// PG 결제 어댑터. M5는 인터페이스 + dev-mock + 실 어댑터 셸.
// ⚠️ 정산금(보증금/수선비) 결제는 Phase 2 — 여기는 구독료 결제 전용.

export type PgChargeInput = {
  landlordId: string;
  monthlyFee: number;
  billingDate: number;
};

export type PgChargeResult =
  | { status: 'ok'; chargeId: string; chargedAt: Date }
  | { status: 'unavailable'; reason: string };

export interface PgAdapter {
  readonly providerName: string;
  charge(input: PgChargeInput): Promise<PgChargeResult>;
}

export function makeDevMockPgAdapter(): PgAdapter {
  return {
    providerName: 'dev-mock',
    async charge(input) {
      return {
        status: 'ok',
        chargeId: `mock_chg_${Math.random().toString(36).slice(2, 11)}`,
        chargedAt: new Date(),
      };
    },
  };
}

// 실 PG (토스페이먼츠 등) — 키 발급 후 구현. 키 없으면 unavailable.
export function makeHttpPgAdapter(opts: {
  provider: string;
  secretKey: string;
}): PgAdapter {
  return {
    providerName: opts.provider,
    async charge(_input) {
      if (!opts.secretKey) {
        return {
          status: 'unavailable',
          reason: `${opts.provider} 비밀키 누락 — .env의 PG_SECRET_KEY 설정 필요`,
        };
      }
      // 실제 PG 어댑터는 키 발급 + 가맹점 등록 후 구현
      throw new Error(
        `${opts.provider} PG 실 어댑터 미구현 — 가맹점 등록 + 키 발급 후 구현 (M5 NEEDS CLARIFICATION)`
      );
    },
  };
}
