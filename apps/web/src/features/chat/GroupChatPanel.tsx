import { Phone, Send, UsersRound, Video } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Group } from '@nova/shared';
import { Avatar } from '../../components/Avatar';
import { ApiError } from '../../lib/api';
import { createId } from '../../lib/platform';
import { connectSocket } from '../../lib/socket';
import { useAuthStore } from '../../stores/auth.store';
import { useNovaStore } from '../../stores/nova.store';

export function GroupChatPanel({ group }: { group: Group }) {
  const navigate = useNavigate();
  const me = useAuthStore((state) => state.user)!;
  const accessToken = useAuthStore((state) => state.accessToken);
  const { groupMessages, openGroup, sendGroupMessage, startCall } = useNovaStore();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const items = groupMessages[group.id] ?? [];
  useEffect(() => { void openGroup(group.id).catch((cause) => setError(cause instanceof Error ? cause.message : 'تعذر تحميل المجموعة.')); }, [group.id, openGroup]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [items.length]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await sendGroupMessage(group.id, text.trim());
      setText('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إرسال الرسالة.');
    } finally {
      setBusy(false);
    }
  };

  const call = async (type: 'voice' | 'video') => {
    const participants = group.members.filter((member) => member.id !== me.id).map((member) => member.id).slice(0, 7);
    if (!participants.length) return;
    const roomId = createId();
    setBusy(true);
    setError('');
    try {
      await startCall(null, 'group', roomId, participants);
      if (!accessToken) throw new Error('Your session is not ready.');
      connectSocket(accessToken).emit('call:invite-group', { receiverIds: participants, roomId, type });
      navigate(`/app/call/${type}/${roomId}?mode=group`);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.code === 'PARTICIPANT_BUSY' ? 'أحد أعضاء المجموعة مشغول في مكالمة أخرى.' : cause instanceof Error ? cause.message : 'تعذر بدء المكالمة.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="chat-panel group-chat-panel">
      <header className="chat-header">
        <div className="chat-person"><span className="group-call-avatar"><UsersRound /></span><span><strong>{group.name}</strong><small>{group.members.length} أعضاء · {group.role === 'owner' ? 'أنت المالك' : group.role}</small></span></div>
        <div className="chat-actions"><button disabled={busy} onClick={() => void call('voice')}><Phone /></button><button disabled={busy} onClick={() => void call('video')}><Video /></button></div>
      </header>
      <div className="message-area">
        {items.map((message) => {
          const sender = group.members.find((member) => member.id === message.senderId);
          const mine = message.senderId === me.id;
          return <div className={`message-row ${mine ? 'mine' : ''}`} key={message.id}>{!mine && sender && <Avatar user={sender} size="sm" />}<div className="message-bubble">{!mine && <strong className="group-message-sender">{sender?.username ?? 'عضو'}</strong>}<p>{message.messageText}</p><span>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div></div>;
        })}
        <div ref={bottom} />
      </div>
      {error && <div className="message-send-error">{error}</div>}
      <form className="chat-compose" onSubmit={(event) => void submit(event)}><input value={text} onChange={(event) => setText(event.target.value)} placeholder={`رسالة إلى ${group.name}`} maxLength={4000} /><button className="send-button" disabled={busy || !text.trim()}><Send /></button></form>
    </section>
  );
}
