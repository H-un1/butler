import { describe, it, expect } from 'vitest';
import { makeInMemoryVoteRepository, tally } from './repository.js';

// 전자투표 in-memory 저장소 + 집계(tally) 순수함수 단위 테스트.

describe('VoteRepository (in-memory)', () => {
  it('createVote → OPEN 상태로 생성되고 getVote/listVotes에 반영', async () => {
    const repo = makeInMemoryVoteRepository();
    const v = await repo.createVote({
      complexName: '햇살아파트',
      creatorId: 'user_1',
      title: '주차장 도색 안건',
      description: '지하주차장 도색 진행 여부',
      options: ['찬성', '반대'],
    });
    expect(v.id).toMatch(/^vote_/);
    expect(v.status).toBe('OPEN');
    expect(v.options).toEqual(['찬성', '반대']);
    expect(v.closesAt).toBeNull();

    const found = await repo.getVote(v.id);
    expect(found?.id).toBe(v.id);
    expect(await repo.getVote('vote_없음')).toBeNull();

    const list = await repo.listVotes('햇살아파트');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(v.id);
    // 다른 단지 투표는 격리
    expect(await repo.listVotes('다른단지')).toHaveLength(0);
  });

  it('closeVote → CLOSED 상태로 전환', async () => {
    const repo = makeInMemoryVoteRepository();
    const v = await repo.createVote({
      complexName: '햇살아파트',
      creatorId: 'user_1',
      title: '안건',
      options: ['A', 'B'],
    });
    const closed = await repo.closeVote(v.id);
    expect(closed.status).toBe('CLOSED');
    // 저장소에도 반영
    expect((await repo.getVote(v.id))?.status).toBe('CLOSED');
  });

  it('castBallot + 중복 투표는 throw (1인 1표), getBallot/listBallots 반영', async () => {
    const repo = makeInMemoryVoteRepository();
    const v = await repo.createVote({
      complexName: '햇살아파트',
      creatorId: 'user_1',
      title: '안건',
      options: ['A', 'B'],
    });

    const b1 = await repo.castBallot({
      voteId: v.id,
      voterId: 'voter_1',
      optionIndex: 0,
    });
    expect(b1.id).toMatch(/^blt_/);
    expect(b1.optionIndex).toBe(0);

    // 같은 voter가 다시 투표 → throw (1인 1표)
    await expect(
      repo.castBallot({ voteId: v.id, voterId: 'voter_1', optionIndex: 1 })
    ).rejects.toThrow();

    // 다른 voter는 정상
    await repo.castBallot({ voteId: v.id, voterId: 'voter_2', optionIndex: 1 });

    const my = await repo.getBallot(v.id, 'voter_1');
    expect(my?.optionIndex).toBe(0);
    expect(await repo.getBallot(v.id, '없는voter')).toBeNull();

    const all = await repo.listBallots(v.id);
    expect(all).toHaveLength(2);
    // 다른 투표의 표는 격리
    expect(await repo.listBallots('vote_other')).toHaveLength(0);
  });
});

describe('tally (집계 순수 함수)', () => {
  it('옵션 3개 + 표 분포 → 정확한 옵션별 득표수', () => {
    const options = ['수리', '교체', '보류'];
    const ballots = [
      { optionIndex: 0 },
      { optionIndex: 0 },
      { optionIndex: 1 },
      { optionIndex: 2 },
      { optionIndex: 2 },
      { optionIndex: 2 },
    ];
    const result = tally(options, ballots);
    expect(result).toEqual([
      { option: '수리', index: 0, count: 2 },
      { option: '교체', index: 1, count: 1 },
      { option: '보류', index: 2, count: 3 },
    ]);
  });

  it('범위 밖 optionIndex는 무시한다', () => {
    const options = ['A', 'B'];
    const ballots = [
      { optionIndex: 0 },
      { optionIndex: 5 }, // 범위 밖 → 무시
      { optionIndex: -1 }, // 음수 → 무시
      { optionIndex: 1 },
    ];
    const result = tally(options, ballots);
    expect(result).toEqual([
      { option: 'A', index: 0, count: 1 },
      { option: 'B', index: 1, count: 1 },
    ]);
  });

  it('표가 없으면 모두 0', () => {
    expect(tally(['A', 'B'], [])).toEqual([
      { option: 'A', index: 0, count: 0 },
      { option: 'B', index: 1, count: 0 },
    ]);
  });
});
