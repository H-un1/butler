import { describe, it, expect, beforeEach } from 'vitest';
import {
  makeInMemorySettlementRepository,
  type SettlementRepository,
  type SettlementInput,
} from './repository.js';
import { computeSettlement, type SettlementLineInput } from './rules.js';

// ============================================================================
// In-memory 정산 repository 단위 테스트
// 생성 시 산출 스냅샷(lines/basis/totals)을 동결 보관하고, 상태전이/이벤트 이력을
// 관리하며, lease/landlord/tenant 별 조회를 제공하는지 검증.
// ============================================================================

const SAMPLE_LINES: SettlementLineInput[] = [
  {
    checklistKey: 'living.wall',
    area: '거실',
    category: 'WALLPAPER',
    grade: 'F',
    markedDefect: true,
    repairCost: 1_000_000,
    yearsUsed: 3,
  },
];

function inputFor(over: Partial<SettlementInput> = {}): SettlementInput {
  return {
    leaseId: 'lease_1',
    inspectionId: 'insp_1',
    landlordId: 'usr_landlord_1',
    tenantId: 'usr_tenant_1',
    computation: computeSettlement(SAMPLE_LINES),
    ...over,
  };
}

describe('In-memory SettlementRepository', () => {
  let repo: SettlementRepository;
  beforeEach(() => {
    repo = makeInMemorySettlementRepository();
  });

  it('create → DRAFT 상태 + 산출 스냅샷(lines/basis/totals) 동결 보관', async () => {
    const comp = computeSettlement(SAMPLE_LINES);
    const rec = await repo.create(inputFor({ computation: comp }));

    expect(rec.id).toMatch(/^stl_/);
    expect(rec.status).toBe('DRAFT');
    expect(rec.leaseId).toBe('lease_1');
    expect(rec.inspectionId).toBe('insp_1');
    expect(rec.landlordId).toBe('usr_landlord_1');
    expect(rec.tenantId).toBe('usr_tenant_1');

    // 스냅샷 동결: 총액/라인/근거가 산출 결과와 동일
    expect(rec.ruleVersion).toBe(comp.ruleVersion);
    expect(rec.totalCost).toBe(comp.totalCost);
    expect(rec.tenantTotal).toBe(comp.tenantTotal);
    expect(rec.landlordTotal).toBe(comp.landlordTotal);
    expect(rec.lines).toEqual(comp.lines);
    expect(rec.basis).toEqual(comp.basis);

    expect(rec.createdAt).toBeInstanceOf(Date);
    expect(rec.updatedAt).toBeInstanceOf(Date);

    // getById로 동일 레코드 조회 가능
    const fetched = await repo.getById(rec.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(rec.id);
  });

  it('inspectionId/tenantId 미지정 시 null로 보관', async () => {
    const rec = await repo.create(
      inputFor({ inspectionId: null, tenantId: null })
    );
    expect(rec.inspectionId).toBeNull();
    expect(rec.tenantId).toBeNull();
  });

  it('getById — 없는 id는 null', async () => {
    expect(await repo.getById('stl_nope')).toBeNull();
  });

  it('updateStatus — 상태 전이 반영 + updatedAt 갱신', async () => {
    const rec = await repo.create(inputFor());
    const proposed = await repo.updateStatus(rec.id, 'PROPOSED');
    expect(proposed.status).toBe('PROPOSED');
    expect(proposed.id).toBe(rec.id);

    const agreed = await repo.updateStatus(rec.id, 'AGREED');
    expect(agreed.status).toBe('AGREED');

    // 다시 조회해도 마지막 상태가 유지
    const fetched = await repo.getById(rec.id);
    expect(fetched!.status).toBe('AGREED');
  });

  it('updateStatus — 없는 id는 예외', async () => {
    await expect(repo.updateStatus('stl_nope', 'PROPOSED')).rejects.toThrow();
  });

  it('addEvent/listEvents — 생성 순서대로 이력 반환', async () => {
    const rec = await repo.create(inputFor());
    await repo.addEvent({ settlementId: rec.id, actorId: 'a1', type: 'COMPUTED', note: '산출' });
    await repo.addEvent({ settlementId: rec.id, actorId: 'a1', type: 'PROPOSED', note: '제안' });
    await repo.addEvent({ settlementId: rec.id, actorId: 'a2', type: 'DISPUTED', note: '이의' });

    const events = await repo.listEvents(rec.id);
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.type)).toEqual(['COMPUTED', 'PROPOSED', 'DISPUTED']);
    expect(events[0].id).toMatch(/^sev_/);
    expect(events[2].actorId).toBe('a2');
    expect(events[2].note).toBe('이의');

    // 다른 정산의 이벤트는 섞이지 않음
    const other = await repo.create(inputFor({ leaseId: 'lease_other' }));
    expect(await repo.listEvents(other.id)).toHaveLength(0);
  });

  it('addEvent — note 미지정 시 null', async () => {
    const rec = await repo.create(inputFor());
    const ev = await repo.addEvent({ settlementId: rec.id, actorId: 'a1', type: 'AGREED' });
    expect(ev.note).toBeNull();
  });

  it('listByLease/listByLandlord/listByTenant — 키별 필터링', async () => {
    const a = await repo.create(
      inputFor({ leaseId: 'lease_A', landlordId: 'L1', tenantId: 'T1' })
    );
    const b = await repo.create(
      inputFor({ leaseId: 'lease_A', landlordId: 'L1', tenantId: 'T1' })
    );
    await repo.create(
      inputFor({ leaseId: 'lease_B', landlordId: 'L2', tenantId: 'T2' })
    );

    const byLease = await repo.listByLease('lease_A');
    expect(byLease).toHaveLength(2);
    expect(byLease.map((s) => s.id).sort()).toEqual([a.id, b.id].sort());

    const byLandlord = await repo.listByLandlord('L1');
    expect(byLandlord).toHaveLength(2);

    const byTenant = await repo.listByTenant('T1');
    expect(byTenant).toHaveLength(2);

    expect(await repo.listByLease('lease_B')).toHaveLength(1);
    expect(await repo.listByLandlord('L2')).toHaveLength(1);
    expect(await repo.listByTenant('T2')).toHaveLength(1);

    // 무관한 키는 빈 배열
    expect(await repo.listByTenant('T_none')).toHaveLength(0);
  });
});
