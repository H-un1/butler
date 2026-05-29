import type { NotificationType } from '@butler/shared';
import type { LeaseRecord } from '../lease/repository.js';

// 자동알림 룰 — 계약 데이터로부터 알림 intent를 결정론적으로 산출(실제 로직, mock 아님).
// 실제 발송은 mock 어댑터가 처리하지만, "언제 무엇을 누구에게" 알릴지는 이 룰이 정한다.

export type NotificationIntent = {
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
  refId: string;
};

export const CONTRACT_EXPIRY_WINDOW_DAYS = 30;
export const RENT_OVERDUE_DAY_OF_MONTH = 5; // 매월 5일 이후 미납이면 연체로 본다

export function periodOf(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

// 계약만료 D-Day 알림 — endAt이 N일 이내(0~윈도우)인 ACTIVE 계약.
export function contractExpiryIntents(
  lease: LeaseRecord,
  now: Date
): NotificationIntent[] {
  if (lease.status !== 'ACTIVE' || !lease.tenantId) return [];
  const dday = daysBetween(now, lease.endAt);
  if (dday < 0 || dday > CONTRACT_EXPIRY_WINDOW_DAYS) return [];
  const title = `계약 만료 D-${dday}`;
  const body = `임대차 계약이 ${dday}일 후 만료됩니다. 갱신/퇴거 정산을 준비하세요.`;
  return [
    { recipientId: lease.landlordId, type: 'CONTRACT_EXPIRY', title, body, refId: lease.id },
    { recipientId: lease.tenantId, type: 'CONTRACT_EXPIRY', title, body, refId: lease.id },
  ];
}

// 월세 미납 알림 — rent>0인 ACTIVE 계약에서 이번 달 납부 기록이 없고
// 오늘이 납부 기준일(5일) 이후이면 연체. refId는 lease:period로 월별 멱등.
export function rentOverdueIntents(
  lease: LeaseRecord,
  now: Date,
  isRentPaidThisMonth: boolean
): NotificationIntent[] {
  if (lease.status !== 'ACTIVE' || !lease.tenantId) return [];
  if (!lease.rent || lease.rent <= 0) return [];
  if (now.getDate() < RENT_OVERDUE_DAY_OF_MONTH) return [];
  if (isRentPaidThisMonth) return [];
  const period = periodOf(now);
  const refId = `${lease.id}:${period}`;
  const title = `월세 미납 (${period})`;
  const body = `${period} 월세 ${lease.rent.toLocaleString()}원이 아직 납부되지 않았습니다.`;
  return [
    { recipientId: lease.landlordId, type: 'RENT_OVERDUE', title, body, refId },
    { recipientId: lease.tenantId, type: 'RENT_OVERDUE', title, body, refId },
  ];
}
