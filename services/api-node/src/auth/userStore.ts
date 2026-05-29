import type { AuthProvider, Role } from '@butler/shared';

export type UserRecord = {
  id: string;
  role: Role;
  name: string;
  phone: string | null;
  email: string | null;
  authProvider: AuthProvider;
  providerUserId: string;
  verifiedAt: Date | null; // PASS 본인인증 완료 시각 — 주민번호는 저장하지 않음
  createdAt: Date;
};

export interface UserStore {
  findByProviderId(
    provider: AuthProvider,
    providerUserId: string
  ): Promise<UserRecord | null>;
  createWithRole(input: {
    role: Role;
    name: string;
    phone: string | null;
    email: string | null;
    authProvider: AuthProvider;
    providerUserId: string;
  }): Promise<UserRecord>;
  markVerified(id: string, verifiedAt: Date): Promise<UserRecord>;
  getById(id: string): Promise<UserRecord | null>;
  listByRole(role: Role): Promise<UserRecord[]>;
}

// === In-memory store (개발/테스트 전용) ===
// production 빌드에서는 Prisma 기반 store(M1-4 작업)로 교체된다.

export function makeInMemoryUserStore(): UserStore {
  const byId = new Map<string, UserRecord>();
  const byProvider = new Map<string, string>(); // `${provider}:${providerUserId}` -> id
  let seq = 0;

  function nextId(role: Role): string {
    seq += 1;
    return `usr_${role.slice(0, 3).toLowerCase()}_${seq.toString().padStart(4, '0')}`;
  }

  return {
    async findByProviderId(provider, providerUserId) {
      const id = byProvider.get(`${provider}:${providerUserId}`);
      return id ? (byId.get(id) ?? null) : null;
    },
    async createWithRole(input) {
      const id = nextId(input.role);
      const rec: UserRecord = {
        id,
        role: input.role,
        name: input.name,
        phone: input.phone,
        email: input.email,
        authProvider: input.authProvider,
        providerUserId: input.providerUserId,
        verifiedAt: null,
        createdAt: new Date(),
      };
      byId.set(id, rec);
      byProvider.set(`${input.authProvider}:${input.providerUserId}`, id);
      return rec;
    },
    async markVerified(id, verifiedAt) {
      const rec = byId.get(id);
      if (!rec) throw new Error(`사용자 없음: ${id}`);
      const updated: UserRecord = { ...rec, verifiedAt };
      byId.set(id, updated);
      return updated;
    },
    async getById(id) {
      return byId.get(id) ?? null;
    },
    async listByRole(role) {
      // 가장 최근에 (mock) 로그인한 점검자가 첫 번째 — 시연 안정성 (이전 시연의 stale user에게 배정되는 문제 회피)
      return [...byId.values()]
        .filter((u) => u.role === role)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
  };
}
