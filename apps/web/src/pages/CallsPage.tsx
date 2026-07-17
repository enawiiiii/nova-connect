import { ArrowDownLeft, ArrowUpRight, Check, Phone, UserRound, UsersRound, Video, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/PageHeader';
import { createId } from '../lib/platform';
import { connectSocket } from '../lib/socket';
import { useAuthStore } from '../stores/auth.store';
import { useNovaStore } from '../stores/nova.store';

type MediaType = 'voice' | 'video';

export function CallsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  const me = useAuthStore((state) => state.user)!;
  const accessToken = useAuthStore((state) => state.accessToken);
  const { calls, friends, startCall } = useNovaStore();
  const [groupType, setGroupType] = useState<MediaType | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const beginIndividual = async (type: MediaType, receiverId: string) => {
    const roomId = createId();
    setStarting(true);
    setError('');
    try {
      await startCall(receiverId, type, roomId);
      if (!accessToken) throw new Error('Your session is not ready. Please try again.');
      connectSocket(accessToken).emit('call:invite', { receiverId, roomId, type });
      navigate(`/app/call/${type}/${roomId}?mode=individual`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر بدء المكالمة الفردية');
    } finally {
      setStarting(false);
    }
  };

  const beginGroup = async () => {
    if (!groupType || selected.length === 0) return;
    const selectedType = groupType;
    const roomId = createId();
    setStarting(true);
    setError('');
    try {
      await startCall(null, 'group', roomId, selected);
      if (!accessToken) throw new Error('Your session is not ready. Please try again.');
      connectSocket(accessToken).emit('call:invite-group', { receiverIds: selected, roomId, type: selectedType });
      setGroupType(null);
      setSelected([]);
      navigate(`/app/call/${selectedType}/${roomId}?mode=group`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر بدء المكالمة الجماعية');
    } finally {
      setStarting(false);
    }
  };

  const toggleFriend = (id: string) => {
    setSelected((items) => items.includes(id)
      ? items.filter((item) => item !== id)
      : items.length < 7 ? [...items, id] : items);
  };

  return (
    <div className="page calls-page">
      <PageHeader
        title={t('calls.title')}
        subtitle="مكالمات فردية بين شخصين، أو غرف جماعية منفصلة"
        action={<button className="button button-primary" onClick={() => document.getElementById('individual-calls')?.scrollIntoView({ behavior: 'smooth' })}><UserRound />اتصال فردي</button>}
      />

      {error && <div className="call-page-error" role="alert">{error}</div>}
      {notice && <div className="call-page-notice" role="status">{notice}</div>}

      <section className="individual-call-panel glass-panel" id="individual-calls">
        <header className="call-mode-heading">
          <span className="call-mode-icon individual"><UserRound /></span>
          <div>
            <span>فردي / شخصان فقط</span>
            <h2>مكالمة بينك وبين صديق واحد</h2>
            <p>اختر شخصًا واحدًا، ثم اضغط صوت أو فيديو.</p>
          </div>
          <strong>2 MAX</strong>
        </header>

        {friends.length ? (
          <div className="individual-friend-grid">
            {friends.map((friend) => (
              <article className="individual-friend-card" key={friend.id}>
                <Avatar user={friend} size="lg" showStatus />
                <span className="call-row-copy">
                  <strong>{friend.username}</strong>
                  <small>{friend.status === 'online' ? 'متصل الآن' : 'غير متصل حاليًا'}</small>
                </span>
                <div>
                  <button disabled={starting} onClick={() => void beginIndividual('voice', friend.id)} aria-label={`مكالمة صوتية فردية مع ${friend.username}`}><Phone /><span>صوت</span></button>
                  <button disabled={starting} onClick={() => void beginIndividual('video', friend.id)} aria-label={`مكالمة فيديو فردية مع ${friend.username}`}><Video /><span>فيديو</span></button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="no-individual-friends"><UserRound /><strong>أضف صديقًا لبدء اتصال فردي</strong><p>بعد قبول طلب الصداقة سيظهر الشخص هنا مع خياري الصوت والفيديو.</p></div>
        )}
      </section>

      <section className="group-call-panel glass-panel">
        <div className="call-mode-heading">
          <span className="call-mode-icon group"><UsersRound /></span>
          <div>
            <span>جماعي / اختياري</span>
            <h2>غرفة لمجموعة من الأصدقاء</h2>
            <p>هذا قسم منفصل للمكالمات الجماعية فقط، حتى 8 مشاركين.</p>
          </div>
          <strong>8 MAX</strong>
        </div>
        <div className="group-call-buttons">
          <button className="button button-ghost" onClick={() => setGroupType('voice')}><Phone />صوت جماعي</button>
          <button className="button button-ghost" onClick={() => setGroupType('video')}><Video />فيديو جماعي</button>
        </div>
      </section>

      <section className="call-history-section">
        <div className="section-heading"><span>{t('calls.history').toUpperCase()}</span><b>{calls.length}</b></div>
        <div className="call-history glass-panel">
          {calls.length === 0 && <div className="empty-call-history"><Phone /><span>لا توجد مكالمات سابقة</span></div>}
          {calls.map((call) => {
            const otherId = call.callerId === me.id ? call.receiverId : call.callerId;
            const friend = friends.find((item) => item.id === otherId);
            const outgoing = call.callerId === me.id;
            const isGroup = call.callType === 'group';
            return (
              <div className="call-row" key={call.id}>
                {isGroup ? <span className="group-call-avatar"><UsersRound /></span> : friend ? <Avatar user={friend} size="md" /> : <span className="group-call-avatar"><UserRound /></span>}
                <span className="individual-friend-copy">
                  <strong>{isGroup ? 'مكالمة جماعية' : friend?.username ?? 'مكالمة فردية'}</strong>
                  <small className={call.status === 'missed' ? 'missed' : ''}>
                    {outgoing ? <ArrowUpRight /> : <ArrowDownLeft />}
                    {call.status === 'missed' ? t('calls.missed') : call.status === 'declined' ? 'مرفوضة' : call.status === 'ringing' ? 'لم يتم الرد' : isGroup ? 'جماعية' : call.callType === 'voice' ? 'فردية · صوت' : 'فردية · فيديو'} · {new Date(call.createdAt).toLocaleDateString()}
                  </small>
                </span>
                <time>{call.duration ? t('calls.minutes', { count: Math.ceil(call.duration / 60) }) : '—'}</time>
                {friend && !isGroup && <div className="history-call-actions"><button disabled={starting} onClick={() => void beginIndividual('voice', friend.id)} aria-label={`اتصال صوتي مع ${friend.username}`}><Phone /></button><button disabled={starting} onClick={() => void beginIndividual('video', friend.id)} aria-label={`اتصال فيديو مع ${friend.username}`}><Video /></button></div>}
              </div>
            );
          })}
        </div>
      </section>

      {groupType && (
        <div className="group-picker-backdrop" role="dialog" aria-modal="true">
          <section className="group-picker glass-panel">
            <header>
              <div>
                <span>مكالمة جماعية</span>
                <h2>{groupType === 'video' ? 'اختر المشاركين لمكالمة الفيديو الجماعية' : 'اختر المشاركين للمكالمة الصوتية الجماعية'}</h2>
                <p>{selected.length} / 7 أصدقاء محددين</p>
              </div>
              <button aria-label="إغلاق" onClick={() => { setGroupType(null); setSelected([]); }}><X /></button>
            </header>
            <div className="group-friend-list">
              {friends.length ? friends.map((friend) => {
                const active = selected.includes(friend.id);
                return (
                  <button className={active ? 'selected' : ''} key={friend.id} onClick={() => toggleFriend(friend.id)}>
                    <Avatar user={friend} size="md" showStatus />
                    <span className="group-friend-copy"><strong>{friend.username}</strong><small>{friend.status === 'online' ? 'متصل الآن' : 'غير متصل حاليًا'}</small></span>
                    <i>{active && <Check />}</i>
                  </button>
                );
              }) : <div className="no-group-friends"><UsersRound /><strong>أضف أصدقاء أولًا</strong><p>يجب أن يكون لديك صديق واحد على الأقل لبدء مكالمة جماعية.</p></div>}
            </div>
            <footer>
              <button className="button button-ghost" onClick={() => { setGroupType(null); setSelected([]); }}>إلغاء</button>
              <button className="button button-primary" disabled={!selected.length || starting} onClick={() => void beginGroup()}>
                {groupType === 'video' ? <Video /> : <Phone />}{starting ? 'جارٍ بدء المكالمة…' : 'بدء المكالمة الجماعية'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
