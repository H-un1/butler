import type { PrismaClient } from '@prisma/client';
import type { VoteStatus } from '@butler/shared';

// 전자투표 — 단지(complexName) 폐쇄형. 1인 1표(Ballot @@unique[voteId,voterId]).

export type VoteInput = {
  complexName: string;
  creatorId: string;
  title: string;
  description?: string | null;
  options: string[];
  closesAt?: Date | null;
};

export type VoteRecord = {
  id: string;
  complexName: string;
  creatorId: string;
  title: string;
  description: string | null;
  options: string[];
  status: VoteStatus;
  closesAt: Date | null;
  createdAt: Date;
};

export type BallotRecord = {
  id: string;
  voteId: string;
  voterId: string;
  optionIndex: number;
  createdAt: Date;
};

export interface VoteRepository {
  createVote(input: VoteInput): Promise<VoteRecord>;
  getVote(id: string): Promise<VoteRecord | null>;
  listVotes(complexName: string): Promise<VoteRecord[]>;
  closeVote(id: string): Promise<VoteRecord>;
  castBallot(input: {
    voteId: string;
    voterId: string;
    optionIndex: number;
  }): Promise<BallotRecord>;
  getBallot(voteId: string, voterId: string): Promise<BallotRecord | null>;
  listBallots(voteId: string): Promise<BallotRecord[]>;
}

function nextVoteId(): string {
  return `vote_${Math.random().toString(36).slice(2, 11)}`;
}
function nextBallotId(): string {
  return `blt_${Math.random().toString(36).slice(2, 11)}`;
}

// 집계 — 옵션별 득표수 (순수 함수)
export function tally(
  options: string[],
  ballots: { optionIndex: number }[]
): { option: string; index: number; count: number }[] {
  const counts = options.map((option, index) => ({ option, index, count: 0 }));
  for (const b of ballots) {
    if (b.optionIndex >= 0 && b.optionIndex < counts.length) {
      counts[b.optionIndex].count += 1;
    }
  }
  return counts;
}

// === In-memory ===

export function makeInMemoryVoteRepository(): VoteRepository {
  const votes = new Map<string, VoteRecord>();
  const ballots: BallotRecord[] = [];
  return {
    async createVote(input) {
      const rec: VoteRecord = {
        id: nextVoteId(),
        complexName: input.complexName,
        creatorId: input.creatorId,
        title: input.title,
        description: input.description ?? null,
        options: input.options,
        status: 'OPEN',
        closesAt: input.closesAt ?? null,
        createdAt: new Date(),
      };
      votes.set(rec.id, rec);
      return rec;
    },
    async getVote(id) {
      return votes.get(id) ?? null;
    },
    async listVotes(complexName) {
      return [...votes.values()]
        .filter((v) => v.complexName === complexName)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async closeVote(id) {
      const rec = votes.get(id);
      if (!rec) throw new Error(`vote 없음: ${id}`);
      const updated = { ...rec, status: 'CLOSED' as VoteStatus };
      votes.set(id, updated);
      return updated;
    },
    async castBallot(input) {
      const dup = ballots.find(
        (b) => b.voteId === input.voteId && b.voterId === input.voterId
      );
      if (dup) throw new Error('이미 투표했습니다 (1인 1표)');
      const rec: BallotRecord = {
        id: nextBallotId(),
        voteId: input.voteId,
        voterId: input.voterId,
        optionIndex: input.optionIndex,
        createdAt: new Date(),
      };
      ballots.push(rec);
      return rec;
    },
    async getBallot(voteId, voterId) {
      return (
        ballots.find((b) => b.voteId === voteId && b.voterId === voterId) ?? null
      );
    },
    async listBallots(voteId) {
      return ballots.filter((b) => b.voteId === voteId);
    },
  };
}

// === Prisma ===

function toVote(rec: {
  id: string;
  complexName: string;
  creatorId: string;
  title: string;
  description: string | null;
  options: unknown;
  status: string;
  closesAt: Date | null;
  createdAt: Date;
}): VoteRecord {
  return {
    id: rec.id,
    complexName: rec.complexName,
    creatorId: rec.creatorId,
    title: rec.title,
    description: rec.description,
    options: Array.isArray(rec.options) ? (rec.options as string[]) : [],
    status: rec.status as VoteStatus,
    closesAt: rec.closesAt,
    createdAt: rec.createdAt,
  };
}

export function makePrismaVoteRepository(prisma: PrismaClient): VoteRepository {
  return {
    async createVote(input) {
      const rec = await prisma.vote.create({
        data: {
          id: nextVoteId(),
          complexName: input.complexName,
          creatorId: input.creatorId,
          title: input.title,
          description: input.description ?? null,
          options: input.options as unknown as object,
          closesAt: input.closesAt ?? null,
        },
      });
      return toVote(rec);
    },
    async getVote(id) {
      const rec = await prisma.vote.findUnique({ where: { id } });
      return rec ? toVote(rec) : null;
    },
    async listVotes(complexName) {
      const list = await prisma.vote.findMany({
        where: { complexName },
        orderBy: { createdAt: 'desc' },
      });
      return list.map(toVote);
    },
    async closeVote(id) {
      const rec = await prisma.vote.update({
        where: { id },
        data: { status: 'CLOSED' },
      });
      return toVote(rec);
    },
    async castBallot(input) {
      const rec = await prisma.ballot.create({
        data: {
          id: nextBallotId(),
          voteId: input.voteId,
          voterId: input.voterId,
          optionIndex: input.optionIndex,
        },
      });
      return rec as BallotRecord;
    },
    async getBallot(voteId, voterId) {
      const rec = await prisma.ballot.findUnique({
        where: { voteId_voterId: { voteId, voterId } },
      });
      return (rec as BallotRecord | null) ?? null;
    },
    async listBallots(voteId) {
      const list = await prisma.ballot.findMany({ where: { voteId } });
      return list as BallotRecord[];
    },
  };
}
