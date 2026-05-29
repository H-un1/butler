import type { PaymentType } from '@butler/shared';

// 범용 PG 게이트웨이 어댑터 (구독료/정산금/월세 공용).
// ⚠️ mock 게이트웨이는 실제 결제를 일으키지 않는다(실 호출 0). 키 발급 시 실 어댑터로 교체.

export type PaymentChargeInput = {
  payerId: string;
  type: PaymentType;
  refId: string;
  amount: number;
  period?: string | null;
};

export type PaymentChargeResult =
  | { status: 'ok'; chargeId: string; chargedAt: Date }
  | { status: 'unavailable'; reason: string };

export interface PaymentGateway {
  readonly providerName: string;
  charge(input: PaymentChargeInput): Promise<PaymentChargeResult>;
}

// mock — 항상 성공하되 실 결제 아님. chargeId에 mock 표식.
export function makeMockPaymentGateway(): PaymentGateway {
  return {
    providerName: 'mock',
    async charge(_input) {
      return {
        status: 'ok',
        chargeId: `mock_pay_${Math.random().toString(36).slice(2, 11)}`,
        chargedAt: new Date(),
      };
    },
  };
}

// 실 PG(토스페이먼츠 등) 셸 — 키 발급 후 구현. 키 없으면 unavailable.
export function makeHttpPaymentGateway(opts: {
  provider: string;
  secretKey: string;
}): PaymentGateway {
  return {
    providerName: opts.provider,
    async charge(_input) {
      if (!opts.secretKey) {
        return {
          status: 'unavailable',
          reason: `${opts.provider} 비밀키 누락 — .env의 PG_SECRET_KEY 설정 필요`,
        };
      }
      throw new Error(`${opts.provider} 실 PG 어댑터 미구현 — 가맹점 등록 + 키 발급 후 구현`);
    },
  };
}
