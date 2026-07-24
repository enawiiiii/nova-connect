import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuthStore } from './stores/auth.store';
import { useNovaStore } from './stores/nova.store';
import { SecureAccessBanner } from './components/SecureAccessBanner';

const AppShell = lazy(() => import('./components/AppShell').then((module) => ({ default: module.AppShell })));
const AuthPage = lazy(() => import('./pages/AuthPage').then((module) => ({ default: module.AuthPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })));
const CallPage = lazy(() => import('./pages/CallPage').then((module) => ({ default: module.CallPage })));
const CallsPage = lazy(() => import('./pages/CallsPage').then((module) => ({ default: module.CallsPage })));
const ChatsPage = lazy(() => import('./pages/ChatsPage').then((module) => ({ default: module.ChatsPage })));
const FriendsPage = lazy(() => import('./pages/FriendsPage').then((module) => ({ default: module.FriendsPage })));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then((module) => ({ default: module.ForgotPasswordPage })));
const LandingPage = lazy(() => import('./pages/LandingPage').then((module) => ({ default: module.LandingPage })));
const LegalPage = lazy(() => import('./pages/LegalPage').then((module) => ({ default: module.LegalPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage').then((module) => ({ default: module.VerifyEmailPage })));

export default function App() {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  useEffect(() => { void bootstrap(); }, [bootstrap]);
  useEffect(() => {
    const reset = () => useNovaStore.getState().reset();
    window.addEventListener('nova:session-ended', reset);
    return () => window.removeEventListener('nova:session-ended', reset);
  }, []);
  return (
    <><SecureAccessBanner /><Suspense fallback={<div className="route-loading" role="status"><i /><span>جارٍ تحميل NOVA…</span></div>}><Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/privacy" element={<LegalPage kind="privacy" />} />
      <Route path="/terms" element={<LegalPage kind="terms" />} />
      <Route path="/acceptable-use" element={<LegalPage kind="acceptable-use" />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Navigate to="chats" replace />} />
          <Route path="chats" element={<ChatsPage />} />
          <Route path="chats/:userId" element={<ChatsPage />} />
          <Route path="groups/:groupId" element={<ChatsPage />} />
          <Route path="friends" element={<FriendsPage />} />
          <Route path="calls" element={<CallsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="admin" element={<AdminPage />} />
        </Route>
        <Route path="/app/call/:type/:roomId" element={<CallPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes></Suspense></>
  );
}
