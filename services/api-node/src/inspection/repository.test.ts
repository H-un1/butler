import { describe, it, expect } from 'vitest';
import { makeInMemoryInspectionRepository } from './repository.js';

describe('InspectionRepository (in-memory)', () => {
  it('create → status 전이 (REQUESTED → SCHEDULED → IN_PROGRESS → DONE)', async () => {
    const repo = makeInMemoryInspectionRepository();
    const insp = await repo.create({
      propertyId: 'prop_1',
      inspectorId: 'usr_ins',
      type: 'REGULAR',
      scheduledAt: new Date('2026-05-30 14:00'),
    });
    expect(insp.status).toBe('REQUESTED');
    expect(insp.id).toMatch(/^insp_/);

    const scheduled = await repo.updateStatus(insp.id, 'SCHEDULED');
    expect(scheduled.status).toBe('SCHEDULED');

    const inProg = await repo.updateStatus(insp.id, 'IN_PROGRESS');
    expect(inProg.status).toBe('IN_PROGRESS');

    const done = await repo.updateStatus(insp.id, 'DONE');
    expect(done.status).toBe('DONE');
  });

  it('appendItem + listItems', async () => {
    const repo = makeInMemoryInspectionRepository();
    const insp = await repo.create({
      propertyId: 'prop_1',
      inspectorId: 'usr_ins',
      type: 'REGULAR',
      scheduledAt: new Date(),
    });
    await repo.appendItem({
      inspectionId: insp.id,
      area: '욕실',
      checklistKey: 'bathroom.leak',
      grade: 'B',
      note: '실리콘 노후',
      markedDefect: true,
    });
    await repo.appendItem({
      inspectionId: insp.id,
      area: '거실',
      checklistKey: 'living.floor',
      grade: 'A',
    });
    const items = await repo.listItems(insp.id);
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.area === '욕실')?.markedDefect).toBe(true);
  });

  it('listByInspector — 점검자가 자기 점검 목록 확인', async () => {
    const repo = makeInMemoryInspectionRepository();
    await repo.create({
      propertyId: 'prop_A',
      inspectorId: 'usr_ins',
      type: 'REGULAR',
      scheduledAt: new Date('2026-05-30'),
    });
    await repo.create({
      propertyId: 'prop_B',
      inspectorId: 'usr_ins',
      type: 'MOVE_OUT',
      scheduledAt: new Date('2026-06-01'),
    });
    await repo.create({
      propertyId: 'prop_C',
      inspectorId: 'usr_other',
      type: 'REGULAR',
      scheduledAt: new Date(),
    });

    const mine = await repo.listByInspector('usr_ins');
    expect(mine).toHaveLength(2);
    // 최신순
    expect(mine[0].scheduledAt.getTime()).toBeGreaterThan(mine[1].scheduledAt.getTime());
  });

  it('createReport — 한 inspection당 1개만 허용', async () => {
    const repo = makeInMemoryInspectionRepository();
    const insp = await repo.create({
      propertyId: 'prop_1',
      inspectorId: 'usr_ins',
      type: 'REGULAR',
      scheduledAt: new Date(),
    });
    const rpt = await repo.createReport({
      inspectionId: insp.id,
      pdfUrl: 's3://bucket/r1.pdf',
      generatedAt: new Date(),
    });
    expect(rpt.id).toMatch(/^rpt_/);

    await expect(
      repo.createReport({
        inspectionId: insp.id,
        pdfUrl: 's3://bucket/r2.pdf',
        generatedAt: new Date(),
      })
    ).rejects.toThrow(/이미/);
  });
});
