import type { NotificationChannel } from '@butler/shared';
import type {
  NotificationInput,
  NotificationRecord,
  NotificationRepository,
} from './repository.js';

// 알림 발송 어댑터.
// ⚠️ 카카오 알림톡/SMS는 mock — 실제 외부 발송 API를 호출하지 않는다(실 호출 0).
//    발송 로그만 메모리에 남기고, 실 키 발급 시 makeHttpNotificationSender로 교체.

export type SendOutput = { sent: boolean; mock: boolean; detail: string };

export interface NotificationSender {
  readonly providerName: string;
  send(input: {
    channel: NotificationChannel;
    recipientId: string;
    title: string;
    body: string | null;
  }): Promise<SendOutput>;
}

// mock 발송 — 실 발송 안 함. 발송 시도 로그만 보관(시연/검증용).
export function makeMockNotificationSender(): NotificationSender & {
  readonly log: ReadonlyArray<{ channel: NotificationChannel; recipientId: string; title: string }>;
} {
  const log: { channel: NotificationChannel; recipientId: string; title: string }[] = [];
  return {
    providerName: 'mock',
    get log() {
      return log;
    },
    async send(input) {
      log.push({
        channel: input.channel,
        recipientId: input.recipientId,
        title: input.title,
      });
      // IN_APP은 발송 개념이 없음(인앱 노출). KAKAO/SMS는 mock 발송 처리.
      const mock = input.channel !== 'IN_APP';
      return {
        sent: true,
        mock,
        detail:
          input.channel === 'IN_APP'
            ? '인앱 알림 적재'
            : `${input.channel} mock 발송(실 호출 없음)`,
      };
    },
  };
}

// 실 발송 어댑터 셸 — 카카오 알림톡/SMS 대행사 키 발급 후 구현.
export function makeHttpNotificationSender(opts: {
  provider: string;
  apiKey: string;
}): NotificationSender {
  return {
    providerName: opts.provider,
    async send() {
      if (!opts.apiKey) {
        return {
          sent: false,
          mock: false,
          detail: `${opts.provider} 키 누락 — 발송 불가(.env 설정 필요)`,
        };
      }
      throw new Error(`${opts.provider} 실 발송 어댑터 미구현 — 키 발급 후 구현`);
    },
  };
}

// 알림 서비스 — 레코드 생성 + (mock)발송을 묶는다. 라우트/이벤트에서 이걸 호출.
export interface NotificationService {
  notify(input: NotificationInput): Promise<NotificationRecord>;
}

export function makeNotificationService(
  repo: NotificationRepository,
  sender: NotificationSender
): NotificationService {
  return {
    async notify(input) {
      const channel = input.channel ?? 'IN_APP';
      const result = await sender.send({
        channel,
        recipientId: input.recipientId,
        title: input.title,
        body: input.body ?? null,
      });
      return repo.create({
        ...input,
        channel,
        // KAKAO/SMS는 mock 발송됨 표식, IN_APP은 false
        sentMock: result.mock && result.sent,
      });
    },
  };
}
