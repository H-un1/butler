import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ROLES } from '@butler/shared';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { RoleGate } from './routing/RoleGate';
import { homeForRole } from './routing/homeForRole';
import { ThemeProvider, LightScope } from './theme/ThemeProvider';
import { LoginPage } from './pages/LoginPage';
import { LandlordLayout } from './pages/landlord/LandlordLayout';
import {
  LandlordDashboard,
  LandlordProperties,
  LandlordLeases,
  LandlordMaintenance,
  LandlordSettlements,
  LandlordBilling,
  LandlordCommunity,
} from './pages/LandlordHome';
import { PropertyNew } from './pages/PropertyNew';
import { PropertyDashboard } from './pages/PropertyDashboard';
import { AdminHome } from './pages/AdminHome';
import { TenantHome } from './pages/TenantHome';
import { SettlementNew } from './pages/SettlementNew';
import { SettlementDetailPage } from './pages/SettlementDetailPage';
import { InspectorNotice } from './pages/InspectorNotice';
import { CommunityPage } from './pages/CommunityPage';
import { AssistantPage } from './pages/AssistantPage';
import { InspectorHome } from './pages/inspector/InspectorHome';
import { InspectionDo } from './pages/inspector/InspectionDo';

function RootRedirect() {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return <Navigate to={homeForRole(session.user.role)} replace />;
}

// 임대인·관리자(+공유 심화 페이지)는 html[data-theme]를 따른다(라이트/다크 토글).
// 임차인·점검자·로그인은 LightScope로 항상 라이트(현행 유지).

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route
              path="/login"
              element={
                <LightScope>
                  <LoginPage />
                </LightScope>
              }
            />

            {/* === 임대인 대시보드 (테마 적용) ===
                LandlordLayout이 사이드바를 상시 유지하고, 콘텐츠 영역(<Outlet/>)만
                중첩 라우트로 교체된다. 모든 임대인 화면에서 사이드바가 유지된다. */}
            <Route
              element={
                <RoleGate allow={[ROLES.LANDLORD]}>
                  <LandlordLayout />
                </RoleGate>
              }
            >
              <Route path="/landlord" element={<LandlordDashboard />} />
              <Route path="/landlord/properties" element={<LandlordProperties />} />
              <Route path="/landlord/properties/new" element={<PropertyNew />} />
              <Route path="/landlord/properties/:id" element={<PropertyDashboard />} />
              <Route path="/landlord/leases" element={<LandlordLeases />} />
              <Route path="/landlord/maintenance" element={<LandlordMaintenance />} />
              <Route path="/landlord/settlements" element={<LandlordSettlements />} />
              <Route path="/landlord/settlements/new" element={<SettlementNew />} />
              <Route
                path="/landlord/settlements/:id"
                element={<SettlementDetailPage embedded />}
              />
              <Route path="/landlord/billing" element={<LandlordBilling />} />
              <Route path="/landlord/community" element={<LandlordCommunity />} />
              <Route path="/landlord/assistant" element={<AssistantPage embedded />} />
            </Route>

            {/* === 공유 심화 페이지 (테마 적용) — 임차인 standalone 진입용 === */}
            <Route
              path="/settlements/:id"
              element={
                <RoleGate allow={[ROLES.LANDLORD, ROLES.TENANT]}>
                  <SettlementDetailPage />
                </RoleGate>
              }
            />
            <Route
              path="/community"
              element={
                <RoleGate allow={[ROLES.LANDLORD, ROLES.TENANT, ROLES.ADMIN]}>
                  <CommunityPage />
                </RoleGate>
              }
            />
            <Route
              path="/assistant"
              element={
                <RoleGate
                  allow={[ROLES.LANDLORD, ROLES.TENANT, ROLES.ADMIN, ROLES.INSPECTOR]}
                >
                  <AssistantPage />
                </RoleGate>
              }
            />

            {/* === 관리자 콘솔 (테마 적용) === */}
            <Route
              path="/admin/*"
              element={
                <RoleGate allow={[ROLES.ADMIN]}>
                  <AdminHome />
                </RoleGate>
              }
            />

            {/* === 임차인·점검자 — 강제 라이트(현행 유지) === */}
            <Route
              path="/tenant"
              element={
                <LightScope>
                  <RoleGate allow={[ROLES.TENANT]}>
                    <TenantHome />
                  </RoleGate>
                </LightScope>
              }
            />
            <Route
              path="/inspector"
              element={
                <LightScope>
                  <RoleGate allow={[ROLES.INSPECTOR]}>
                    <InspectorHome />
                  </RoleGate>
                </LightScope>
              }
            />
            <Route
              path="/inspector/:id"
              element={
                <LightScope>
                  <RoleGate allow={[ROLES.INSPECTOR]}>
                    <InspectionDo />
                  </RoleGate>
                </LightScope>
              }
            />
            <Route
              path="/inspector-not-supported"
              element={
                <LightScope>
                  <InspectorNotice />
                </LightScope>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
