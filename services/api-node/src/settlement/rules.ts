import type {
  InspectionGrade,
  SettlementCategory,
} from '@butler/shared';

// ============================================================================
// 수선비 정산 룰엔진 (룰베이스 — 본체)
//
// 분담비율은 AI 임의추론이 아니라 아래 3가지 룰의 결정론적 계산으로 산출한다:
//   1) LH 부담기준표  — 항목 카테고리별 임차인 귀책(부담) 기본 비율
//   2) 표준 내구연수   — 카테고리별 표준 수명(년)
//   3) 감가상각        — 사용연수가 길수록 임차인 원상복구 부담을 잔존가치 비율로 감액
//
// ⚠️ 아래 상수표는 잠정값이다 (RECOVERY.md). 정식 LH 기준 확정 시 RULE_VERSION을
//    올리고 표를 갱신한다. ai-python(butler_ai/settlement/rules.py)의 표와 반드시 일치.
// ============================================================================

export const RULE_VERSION = 'lh-rule-2026.05-provisional';

// 표준 내구연수(년) — 카테고리별
export const STANDARD_DURABILITY_YEARS: Record<SettlementCategory, number> = {
  WALLPAPER: 6,
  FLOORING: 8,
  PAINT: 5,
  PLUMBING: 15,
  APPLIANCE: 7,
  FIXTURE: 10,
  ETC: 10,
};

// LH 부담기준표 — 임차인 귀책(부담) 기본 비율 (0.0 = 전적 임대인, 1.0 = 전적 임차인)
// 노후·구조성 항목일수록 임대인 부담이 크다.
export const TENANT_FAULT_RATIO: Record<SettlementCategory, number> = {
  WALLPAPER: 0.7,
  FLOORING: 0.6,
  PAINT: 0.5,
  PLUMBING: 0.1,
  APPLIANCE: 0.2,
  FIXTURE: 0.3,
  ETC: 0.5,
};

// 등급별 손상 가중 — A~C는 통상 마모(정산 제외 가능), D~F는 손상으로 가중.
// 임차인 귀책분에 곱해지는 심각도 계수.
export const GRADE_SEVERITY: Record<InspectionGrade, number> = {
  A: 0,
  B: 0,
  C: 0.5,
  D: 1.0,
  E: 1.0,
  F: 1.0,
};

export type SettlementLineInput = {
  checklistKey: string;
  area: string;
  category: SettlementCategory;
  grade: InspectionGrade;
  markedDefect: boolean;
  repairCost: number; // 원
  yearsUsed: number; // 해당 항목 사용 연수
};

export type SettlementLineResult = SettlementLineInput & {
  durabilityYears: number;
  tenantFaultRatio: number;
  gradeSeverity: number;
  residualRatio: number; // 잔존가치 비율 (감가상각 후)
  tenantShare: number;
  landlordShare: number;
  eligible: boolean; // 정산 대상 여부 (손상·결함만)
};

export type SettlementComputation = {
  ruleVersion: string;
  lines: SettlementLineResult[];
  totalCost: number;
  tenantTotal: number;
  landlordTotal: number;
  basis: {
    ruleVersion: string;
    durabilityTable: Record<string, number>;
    faultTable: Record<string, number>;
    formula: string;
    computedNote: string;
  };
};

// 잔존가치(감가상각) — 사용연수가 내구연수에 가까울수록 임차인 부담 감액.
// residual = max(0, (durability - yearsUsed) / durability)
function residualRatio(durability: number, yearsUsed: number): number {
  if (durability <= 0) return 0;
  const r = (durability - yearsUsed) / durability;
  return Math.max(0, Math.min(1, r));
}

// 한 라인의 임차인 부담액:
//   tenantShare = repairCost × tenantFaultRatio × gradeSeverity × residualRatio
// 정산 대상은 결함 마킹(markedDefect) 또는 등급 C 이하(손상)인 항목.
export function computeLine(input: SettlementLineInput): SettlementLineResult {
  const durabilityYears = STANDARD_DURABILITY_YEARS[input.category];
  const faultRatio = TENANT_FAULT_RATIO[input.category];
  const severity = GRADE_SEVERITY[input.grade];
  const residual = residualRatio(durabilityYears, input.yearsUsed);

  // 통상 마모(A/B, 결함 미마킹)는 임대인 부담(임차인 0) — 원상복구 의무 아님
  const eligible = input.markedDefect || severity > 0;
  const cost = Math.max(0, Math.round(input.repairCost));

  let tenantShare = 0;
  if (eligible && cost > 0) {
    tenantShare = Math.round(cost * faultRatio * severity * residual);
  }
  // 임차인 부담이 총액을 넘지 않도록 클램프
  tenantShare = Math.max(0, Math.min(cost, tenantShare));
  const landlordShare = cost - tenantShare;

  return {
    ...input,
    repairCost: cost,
    durabilityYears,
    tenantFaultRatio: faultRatio,
    gradeSeverity: severity,
    residualRatio: Number(residual.toFixed(4)),
    tenantShare,
    landlordShare,
    eligible,
  };
}

export function computeSettlement(
  lines: SettlementLineInput[]
): SettlementComputation {
  const results = lines.map(computeLine);
  const totalCost = results.reduce((s, l) => s + l.repairCost, 0);
  const tenantTotal = results.reduce((s, l) => s + l.tenantShare, 0);
  const landlordTotal = results.reduce((s, l) => s + l.landlordShare, 0);

  return {
    ruleVersion: RULE_VERSION,
    lines: results,
    totalCost,
    tenantTotal,
    landlordTotal,
    basis: {
      ruleVersion: RULE_VERSION,
      durabilityTable: { ...STANDARD_DURABILITY_YEARS },
      faultTable: { ...TENANT_FAULT_RATIO },
      formula:
        'tenantShare = repairCost × tenantFaultRatio × gradeSeverity × residualRatio; residualRatio = max(0,(durability−yearsUsed)/durability)',
      computedNote:
        'LH 부담기준표·표준 내구연수·감가상각 기반 룰 산출 (AI 추론 아님). 잠정 상수표 — 정식 기준 확정 시 갱신.',
    },
  };
}
