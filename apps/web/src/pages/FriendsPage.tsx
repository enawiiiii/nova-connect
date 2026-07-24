import { Check, MessageCircle, Search, Trash2, UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { PublicUser } from '@nova/shared';
import { Avatar } from '../components/Avatar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageHeader } from '../components/PageHeader';
import { product } from '../config/product';
import { useNovaStore } from '../stores/nova.store';

export function FriendsPage() {
  const { t } = useTranslation();
  const { friends, requests, respondRequest, searchUsers, sendRequest, removeFriend } = useNovaStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUser[]>([]);
  const [sent, setSent] = useState<string[]>([]);
  const [removing, setRemoving] = useState('');
  const [responding, setResponding] = useState('');
  const [sending, setSending] = useState('');
  const [error, setError] = useState('');
  const [removeTarget, setRemoveTarget] = useState<{ friendshipId: string; username: string } | null>(null);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (query.trim().length >= 2) void searchUsers(query).then((people) => {
        if (active) setResults(people.filter((person) => !friends.some((friend) => friend.id === person.id)));
      }).catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Search failed');
      });
      else setResults([]);
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [friends, query, searchUsers]);

  const respond = async (id: string, action: 'accept' | 'reject') => {
    if (responding) return;
    setResponding(id);
    setError('');
    try {
      await respondRequest(id, action);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update friend request');
    } finally {
      setResponding('');
    }
  };

  const send = async (receiverId: string) => {
    if (sending || sent.includes(receiverId)) return;
    setSending(receiverId);
    setError('');
    try {
      await sendRequest(receiverId);
      setSent((items) => [...items, receiverId]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send friend request');
    } finally {
      setSending('');
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    setRemoving(removeTarget.friendshipId);
    setError('');
    try {
      await removeFriend(removeTarget.friendshipId);
      setRemoveTarget(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove friend');
    } finally {
      setRemoving('');
    }
  };

  return (
    <div className="page friends-page">
      <PageHeader title={t('friends.title')} subtitle={t('friends.subtitle')} action={<button className="button button-primary" onClick={() => document.getElementById('friend-search')?.focus()}><UserPlus />{t('friends.add')}</button>} />
      {error && <div className="call-page-error" role="alert">{error}</div>}
      {requests.length > 0 && <section className="request-section glass-panel"><div className="section-heading"><span>{t('friends.requests')}</span><b>{requests.length}</b></div><div className="request-grid">{requests.map((request) => <article key={request.id}><Avatar user={request.user} size="lg" showStatus /><div><strong>{request.user.username}</strong><small>{request.user.bio}</small></div><div><button className="accept" disabled={Boolean(responding)} onClick={() => void respond(request.id, 'accept')}><Check />{t('friends.accept')}</button><button disabled={Boolean(responding)} onClick={() => void respond(request.id, 'reject')}><X />{t('friends.decline')}</button></div></article>)}</div></section>}
      <section className="friend-search-section"><label className="search-box large"><Search /><input id="friend-search" value={query} onChange={(event) => { setQuery(event.target.value); setError(''); }} placeholder={t('friends.search')} /></label>{results.length > 0 && <div className="search-results glass-panel">{results.map((person) => <div key={person.id}><Avatar user={person} size="md" showStatus /><span><strong>{person.username}</strong><small>{person.bio}</small></span><button disabled={sent.includes(person.id) || sending === person.id} onClick={() => void send(person.id)}>{sent.includes(person.id) ? t('friends.pending') : <><UserPlus />{t('friends.add')}</>}</button></div>)}</div>}</section>
      <section><div className="section-heading"><span>ALL FRIENDS</span><b>{friends.length}</b></div><div className="friend-grid">{friends.map((friend) => <article className="friend-card glass-panel" key={friend.id}><div className="friend-card-top"><Avatar user={friend} size="xl" showStatus /><span className={`status-chip ${friend.status}`}>{friend.status}</span></div><h3>{friend.username}</h3><p>{friend.bio || `In your ${product.shortName} orbit`}</p><div className="friend-card-actions"><Link to={`/app/chats/${friend.id}`}><MessageCircle />{t('friends.message')}</Link><button disabled={removing === friend.friendshipId} onClick={() => setRemoveTarget({ friendshipId: friend.friendshipId, username: friend.username })} aria-label={`Remove ${friend.username}`}><Trash2 /></button></div></article>)}</div></section>
      <ConfirmDialog open={Boolean(removeTarget)} title={`إزالة ${removeTarget?.username ?? ''} من الأصدقاء؟`} description="ستُحذف الصداقة من الطرفين، ويمكنكما إرسال طلب صداقة جديد لاحقاً." confirmLabel="إزالة الصديق" loading={Boolean(removing)} onCancel={() => setRemoveTarget(null)} onConfirm={() => void remove()} />
    </div>
  );
}
