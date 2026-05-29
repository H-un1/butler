import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { homeForRole } from '../routing/homeForRole';
import { SettlementDetailPanel } from '../components/SettlementDetailPanel';

// 정산 상세 단독 페이지 — 임대인·임차인 공용.
// - 임차인: standalone(/settlements/:id) — 사이드바 없이 전체화면(기존 그대로).
// - 임대인: embedded(/landlord/settlements/:id) — LandlordLayout 사이드바 안에서
//   콘텐츠만 렌더(외곽 래퍼·자체 네비 생략).
export function SettlementDetailPage({ embedded }: { embedded?: boolean }) {
  const { session } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!session || !id) return null;

  // 임대인 embedded — 레이아웃이 사이드바·여백을 제공하므로 콘텐츠만 렌더.
  if (embedded) {
    return (
      <>
        <div className="admin-breadcrumb mono">
          <span>임대인</span>
          <span className="admin-breadcrumb__sep">/</span>
          <span>정산</span>
          <span className="admin-breadcrumb__sep">/</span>
          <span className="admin-breadcrumb__current">정산 상세</span>
        </div>
        <h1 className="text-fg mt-2 mb-6" style={{ fontSize: 28, lineHeight: 1.3, fontWeight: 700 }}>
          수선비 정산 상세
        </h1>
        <SettlementDetailPanel settlementId={id} />
      </>
    );
  }

  // 임차인 standalone — 기존 전체화면 렌더(현행 유지).
  return (
    <div className="min-h-screen">
      <main
        className="max-w-[960px] mx-auto px-6"
        style={{ paddingTop: 56, paddingBottom: 100 }}
      >
        <button
          type="button"
          onClick={() => navigate(homeForRole(session.user.role))}
          className="text-fg-muted hover:text-fg transition"
          style={{ fontSize: 13 }}
        >
          ← 홈으로
        </button>

        <h1 className="text-fg mt-4 mb-6" style={{ fontSize: 28, lineHeight: 1.3, fontWeight: 700 }}>
          수선비 정산 상세
        </h1>

        <SettlementDetailPanel settlementId={id} />
      </main>
    </div>
  );
}
