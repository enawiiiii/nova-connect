import type { PublicUser } from '@nova/shared';
import { Camera, Check, LoaderCircle, Sparkles } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/PageHeader';
import { product } from '../config/product';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';
import { useNovaStore } from '../stores/nova.store';

export function ProfilePage() {
  const { t } = useTranslation();
  const { user, accessToken, demo, updateUser } = useAuthStore();
  const friends = useNovaStore((state) => state.friends);
  const calls = useNovaStore((state) => state.calls);
  const [username, setUsername] = useState(user!.username);
  const [avatar, setAvatar] = useState(user!.avatar ?? '');
  const [bio, setBio] = useState(user!.bio ?? '');
  const [status, setStatus] = useState(user!.status);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const uploadAvatar = async (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('اختر صورة بصيغة JPEG أو PNG أو WebP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('يجب ألا يتجاوز حجم صورة البروفايل 2 ميجابايت.');
      return;
    }
    setError('');
    setUploading(true);
    try {
      if (demo) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        setAvatar(dataUrl);
        updateUser({ ...user!, avatar: dataUrl });
      } else {
        const form = new FormData();
        form.append('avatar', file);
        const updated = await api<PublicUser>('/users/me/avatar', { method: 'POST', token: accessToken, body: form });
        setAvatar(updated.avatar ?? '');
        updateUser(updated);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر رفع صورة البروفايل.');
    } finally {
      setUploading(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const values = { username, bio, status };
      const updated = demo ? { ...user!, ...values } : await api<typeof user>('/users/me', { method: 'PATCH', token: accessToken, body: values });
      if (updated) {
        updateUser(updated);
        setAvatar(updated.avatar ?? '');
      }
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  const previewUser = { ...user!, username, avatar: avatar.trim() || null };
  return (
    <div className="page profile-page">
      <PageHeader title={t('profile.title')} subtitle={t('profile.subtitle')} />
      {error && <div className="call-page-error" role="alert">{error}</div>}
      <div className="profile-layout">
        <form className="profile-form glass-panel" onSubmit={submit}>
          <div className="profile-photo">
            <Avatar user={previewUser} size="xl" showStatus />
            <label className="profile-photo-upload" aria-label="رفع صورة بروفايل">
              {uploading ? <LoaderCircle className="spin" /> : <Camera />}
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(event) => void uploadAvatar(event.target.files?.[0])} />
            </label>
          </div>
          <p className="profile-photo-help">JPEG أو PNG أو WebP — بحد أقصى 2 MB</p>
          <label><span>{t('profile.username')}</span><input required minLength={3} maxLength={32} pattern="[A-Za-z0-9_]+" title="استخدم الأحرف الإنجليزية والأرقام والشرطة السفلية فقط" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label><span>{t('profile.bio')}</span><textarea maxLength={280} value={bio} onChange={(event) => setBio(event.target.value)} /><small>{bio.length} / 280</small></label>
          <label><span>{t('profile.status')}</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="online">Online</option><option value="away">Away</option><option value="busy">Do not disturb</option><option value="offline">Appear offline</option></select></label>
          <button className="button button-primary" disabled={saving}>{saved ? <><Check />Saved</> : saving ? 'Saving…' : t('common.save')}</button>
        </form>
        <aside className="profile-preview glass-panel">
          <span>{t('profile.preview').toUpperCase()}</span>
          <div className="preview-cover"><i /><i /></div>
          <Avatar user={previewUser} size="xl" showStatus />
          <h2>{username}</h2>
          <p>@{username.toLowerCase()} · in your orbit</p>
          <blockquote>{bio || 'Add a little something about yourself.'}</blockquote>
          <div className="profile-stats"><span><strong>{friends.length}</strong>Friends</span><span><strong>{calls.length}</strong>Calls</span><span><Sparkles />{product.shortName} Member</span></div>
        </aside>
      </div>
    </div>
  );
}
