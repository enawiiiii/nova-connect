import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthPage } from './pages/AuthPage';
import { CallPage } from './pages/CallPage';
import { CallsPage } from './pages/CallsPage';
import { ChatsPage } from './pages/ChatsPage';
import { FriendsPage } from './pages/FriendsPage';
import { LandingPage } from './pages/LandingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { useAuthStore } from './stores/auth.store';
import { useNovaStore } from './stores/nova.store';
import { SecureAccessBanner } from './components/SecureAccessBanner';

export default function App() {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  useEffect(() => { void bootstrap(); }, [bootstrap]);
  useEffect(() => {
    const reset = () => useNovaStore.getState().reset();
    window.addEventListener('nova:session-ended', reset);
    return () => window.removeEventListener('nova:session-ended', reset);
  }, []);
  return (
    <><SecureAccessBanner /><Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
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
        </Route>
        <Route path="/app/call/:type/:roomId" element={<CallPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes></>
  );
}
