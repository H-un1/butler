// 정산 엔진 클라이언트.
// - HTTP: ai-python(butler_ai/settlement)의 POST /settlement/compute 호출 (정식 호스트)
// - Local: rules.ts의 동일 룰을 그대로 실행 (mock 아님 — 실제 룰 계산).
//   ai-python 미기동(dev/test) 시 사용. 두 구현은 같은 상수표를 써야 한다.

import { computeSettlement, type SettlementComputation, type SettlementLineInput } from './rules.js';

export interface SettlementEngine {
  compute(lines: SettlementLineInput[]): Promise<SettlementComputation>;
}

// 로컬 룰 엔진 — 실제 계산. ai-python과 동치.
export function makeLocalSettlementEngine(): SettlementEngine {
  return {
    async compute(lines) {
      return computeSettlement(lines);
    },
  };
}

// ai-python HTTP 엔진 — 정식 호스트.
export function makeHttpSettlementEngine(baseUrl: string): SettlementEngine {
  return {
    async compute(lines) {
      const r = await fetch(`${baseUrl}/settlement/compute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lines: lines.map((l) => ({
            checklist_key: l.checklistKey,
            area: l.area,
            category: l.category,
            grade: l.grade,
            marked_defect: l.markedDefect,
            repair_cost: l.repairCost,
            years_used: l.yearsUsed,
          })),
        }),
      });
      if (!r.ok) throw new Error(`정산 엔진 호출 실패 ${r.status}`);
      const body = (await r.json()) as {
        rule_version: string;
        total_cost: number;
        tenant_total: number;
        landlord_total: number;
        lines: Array<Record<string, unknown>>;
        basis: SettlementComputation['basis'];
      };
      return {
        ruleVersion: body.rule_version,
        totalCost: body.total_cost,
        tenantTotal: body.tenant_total,
        landlordTotal: body.landlord_total,
        lines: body.lines.map((l) => ({
          checklistKey: l.checklist_key as string,
          area: l.area as string,
          category: l.category as SettlementComputation['lines'][number]['category'],
          grade: l.grade as SettlementComputation['lines'][number]['grade'],
          markedDefect: l.marked_defect as boolean,
          repairCost: l.repair_cost as number,
          yearsUsed: l.years_used as number,
          durabilityYears: l.durability_years as number,
          tenantFaultRatio: l.tenant_fault_ratio as number,
          gradeSeverity: l.grade_severity as number,
          residualRatio: l.residual_ratio as number,
          tenantShare: l.tenant_share as number,
          landlordShare: l.landlord_share as number,
          eligible: l.eligible as boolean,
        })),
        basis: body.basis,
      };
    },
  };
}
