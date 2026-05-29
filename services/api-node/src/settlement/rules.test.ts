import { describe, it, expect } from 'vitest';
import {
  computeLine,
  computeSettlement,
  RULE_VERSION,
  STANDARD_DURABILITY_YEARS,
  TENANT_FAULT_RATIO,
  GRADE_SEVERITY,
  type SettlementLineInput,
} from './rules.js';

// ============================================================================
// 정산 룰엔진 단위 테스트 — computeLine / computeSettlement
//
// 분담비율은 결정론적 룰(LH 부담기준표 × 등급심각도 × 감가상각)로 산출된다.
// 각 케이스의 기대값을 손계산으로 단언한다.
// ============================================================================

// 테스트 입력 라인 생성 헬퍼 (필수 필드 기본값 채움)
function line(over: Partial<SettlementLineInput>): SettlementLineInput {
  return {
    checklistKey: 'living.wall',
    area: '거실',
    category: 'WALLPAPER',
    grade: 'F',
    markedDefect: true,
    repairCost: 1_000_000,
    yearsUsed: 3,
    ...over,
  };
}

describe('computeLine (라인 단위 계산)', () => {
  it('도배(WALLPAPER) F등급·결함마킹, 100만원, 사용 3년 → 잔존 0.5, 임차인 35만/임대인 65만', () => {
    // durability=6, fault=0.7, severity=1.0, residual=(6-3)/6=0.5
    // tenantShare = round(1_000_000 × 0.7 × 1.0 × 0.5) = 350_000
    const r = computeLine(
      line({
        category: 'WALLPAPER',
        grade: 'F',
        markedDefect: true,
        repairCost: 1_000_000,
        yearsUsed: 3,
      })
    );
    expect(r.durabilityYears).toBe(6);
    expect(r.tenantFaultRatio).toBe(0.7);
    expect(r.gradeSeverity).toBe(1.0);
    expect(r.residualRatio).toBe(0.5);
    expect(r.eligible).toBe(true);
    expect(r.tenantShare).toBe(350_000);
    expect(r.landlordShare).toBe(650_000);
    // 합산은 항상 총액과 일치
    expect(r.tenantShare + r.landlordShare).toBe(r.repairCost);
  });

  it('배관(PLUMBING) D등급·결함마킹, 200만원, 사용 5년 → 정확한 round 단언', () => {
    // durability=15, fault=0.1, severity=1.0, residual=(15-5)/15
    const durability = 15;
    const yearsUsed = 5;
    const residual = (durability - yearsUsed) / durability;
    const expectedTenant = Math.round(2_000_000 * 0.1 * 1.0 * residual); // 133_333
    const r = computeLine(
      line({
        category: 'PLUMBING',
        grade: 'D',
        markedDefect: true,
        repairCost: 2_000_000,
        yearsUsed: 5,
      })
    );
    expect(r.durabilityYears).toBe(15);
    expect(r.tenantFaultRatio).toBe(0.1);
    expect(r.gradeSeverity).toBe(1.0);
    expect(r.tenantShare).toBe(expectedTenant);
    expect(r.tenantShare).toBe(133_333);
    expect(r.landlordShare).toBe(2_000_000 - 133_333);
  });

  it('A등급·결함 미마킹(통상마모) → eligible false, 임차인 0, 임대인 = 전액', () => {
    const r = computeLine(
      line({
        category: 'WALLPAPER',
        grade: 'A',
        markedDefect: false,
        repairCost: 800_000,
        yearsUsed: 1,
      })
    );
    expect(r.eligible).toBe(false);
    expect(r.tenantShare).toBe(0);
    expect(r.landlordShare).toBe(800_000);
  });

  it('사용연수 ≥ 내구연수 → 잔존가치 0 → 임차인 0 (감가 소진)', () => {
    // WALLPAPER durability=6, yearsUsed=6 → residual 0
    const r = computeLine(
      line({
        category: 'WALLPAPER',
        grade: 'F',
        markedDefect: true,
        repairCost: 1_000_000,
        yearsUsed: 6,
      })
    );
    expect(r.residualRatio).toBe(0);
    expect(r.tenantShare).toBe(0);
    expect(r.landlordShare).toBe(1_000_000);
    // 사용연수가 내구연수를 초과해도 음수가 되지 않고 0으로 클램프
    const over = computeLine(
      line({ category: 'WALLPAPER', grade: 'F', markedDefect: true, repairCost: 1_000_000, yearsUsed: 99 })
    );
    expect(over.residualRatio).toBe(0);
    expect(over.tenantShare).toBe(0);
  });

  it('C등급 → 심각도 0.5 적용 (통상 vs 손상 중간)', () => {
    // WALLPAPER durability=6, fault=0.7, yearsUsed=0 → residual 1.0
    // tenantShare = round(1_000_000 × 0.7 × 0.5 × 1.0) = 350_000
    const r = computeLine(
      line({
        category: 'WALLPAPER',
        grade: 'C',
        markedDefect: false,
        repairCost: 1_000_000,
        yearsUsed: 0,
      })
    );
    expect(r.gradeSeverity).toBe(0.5);
    // C등급은 손상으로 간주 → eligible (severity>0)
    expect(r.eligible).toBe(true);
    expect(r.tenantShare).toBe(350_000);
  });

  it('등급 A/B는 심각도 0 — 마킹돼도 임차인 부담 0 (severity 곱셈)', () => {
    const b = computeLine(
      line({ category: 'WALLPAPER', grade: 'B', markedDefect: true, repairCost: 1_000_000, yearsUsed: 0 })
    );
    // markedDefect true라 eligible이지만 severity 0이므로 tenantShare 0
    expect(b.gradeSeverity).toBe(0);
    expect(b.eligible).toBe(true);
    expect(b.tenantShare).toBe(0);
    expect(b.landlordShare).toBe(1_000_000);
  });

  it('임차인 부담은 총액을 초과하지 않도록 클램프된다', () => {
    const r = computeLine(
      line({ category: 'WALLPAPER', grade: 'F', markedDefect: true, repairCost: 0, yearsUsed: 0 })
    );
    expect(r.tenantShare).toBe(0);
    expect(r.landlordShare).toBe(0);
  });
});

describe('computeSettlement (여러 라인 합산)', () => {
  it('여러 라인 → totalCost/tenantTotal/landlordTotal 합이 라인 합과 일치', () => {
    const lines: SettlementLineInput[] = [
      line({ category: 'WALLPAPER', grade: 'F', markedDefect: true, repairCost: 1_000_000, yearsUsed: 3 }),
      line({ category: 'PLUMBING', grade: 'D', markedDefect: true, repairCost: 2_000_000, yearsUsed: 5 }),
      line({ category: 'FLOORING', grade: 'A', markedDefect: false, repairCost: 500_000, yearsUsed: 1 }),
    ];
    const c = computeSettlement(lines);
    expect(c.lines).toHaveLength(3);

    const expectedTotal = c.lines.reduce((s, l) => s + l.repairCost, 0);
    const expectedTenant = c.lines.reduce((s, l) => s + l.tenantShare, 0);
    const expectedLandlord = c.lines.reduce((s, l) => s + l.landlordShare, 0);

    expect(c.totalCost).toBe(expectedTotal);
    expect(c.tenantTotal).toBe(expectedTenant);
    expect(c.landlordTotal).toBe(expectedLandlord);
    // 임차인 + 임대인 = 총액 (보증금 자동공제 같은 별도 차감 없음)
    expect(c.tenantTotal + c.landlordTotal).toBe(c.totalCost);

    // 구체값: 도배 35만 + 배관 133,333 + 바닥(통상마모) 0 = 483,333
    expect(c.tenantTotal).toBe(350_000 + 133_333 + 0);
    expect(c.totalCost).toBe(3_500_000);
  });

  it('ruleVersion과 basis(durabilityTable/faultTable/formula) 근거 스냅샷 포함', () => {
    const c = computeSettlement([line({})]);
    expect(c.ruleVersion).toBe(RULE_VERSION);
    expect(c.basis.ruleVersion).toBe(RULE_VERSION);
    // 근거표는 실제 상수표와 동일해야 한다 (감사·재현 가능성)
    expect(c.basis.durabilityTable).toEqual(STANDARD_DURABILITY_YEARS);
    expect(c.basis.faultTable).toEqual(TENANT_FAULT_RATIO);
    expect(typeof c.basis.formula).toBe('string');
    expect(c.basis.formula.length).toBeGreaterThan(0);
    expect(typeof c.basis.computedNote).toBe('string');
  });

  it('등급심각도 상수표가 기대 매핑(A/B 0, C 0.5, D/E/F 1.0)을 유지', () => {
    expect(GRADE_SEVERITY).toEqual({ A: 0, B: 0, C: 0.5, D: 1.0, E: 1.0, F: 1.0 });
  });
});
