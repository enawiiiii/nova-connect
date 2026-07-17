import { CheckCheck, Mic, MoreHorizontal, Paperclip, Phone, Send, Smile, Video } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { Friend } from '../../lib/demo-data';
import { ApiError } from '../../lib/api';
import { connectSocket, getSocket } from '../../lib/socket';
import { createId } from '../../lib/platform';
import { useAuthStore } from '../../stores/auth.store';
import { useNovaStore } from '../../stores/nova.store';
import { Avatar } from '../../components/Avatar';

export function ChatPanel({ friend }: { friend: Friend }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useAuthStore((state) => state.user)!;
  const accessToken = useAuthStore((state) => state.accessToken);
  const { messages, typing, openConversation, sendMessage, startCall } = useNovaStore();
  const [text, setText] = useState('');
  const [callError, setCallError] = useState('');
  const [startingCall, setStartingCall] = useState(false);
  const [sending, setSending] = useState(false);
  const [messageError, setMessageError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const items = messages[friend.id] ?? [];
  useEffect(() => {
    void openConversation(friend.id).catch((error) => {
      setMessageError(error instanceof Error ? error.message : 'تعذر تحميل المحادثة.');
    });
  }, [friend.id, openConversation]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [items.length, typing, friend.id]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const clean = text.trim();
    if (!clean || sending) return;
    setSending(true);
    setMessageError('');
    try {
      await sendMessage(friend.id, clean);
      setText('');
      getSocket()?.emit('typing:stop', { receiverId: friend.id });
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : 'تعذر إرسال الرسالة.');
    } finally {
      setSending(false);
    }
  };
  const beginCall = async (type: 'voice' | 'video') => {
    const roomId = createId();
    setStartingCall(true);
    setCallError('');
    try {
      await startCall(friend.id, type, roomId);
      if (!accessToken) throw new Error('Your session is not ready. Please try again.');
      connectSocket(accessToken).emit('call:invite', { receiverId: friend.id, roomId, type });
      navigate(`/app/call/${type}/${roomId}?mode=individual`);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'USER_BUSY') setCallError(t('call.busy'));
      else if (error instanceof ApiError && error.code === 'CALLER_BUSY') setCallError(t('call.alreadyBusy'));
      else setCallError(error instanceof Error ? error.message : 'تعذر بدء المكالمة');
    } finally {
      setStartingCall(false);
    }
  };
  return (
    <section className="chat-panel">
      <header className="chat-header"><div className="chat-person"><Avatar user={friend} size="md" showStatus /><span><strong>{friend.username}</strong><small>{friend.status === 'online' ? t('common.online') : `Last seen ${friend.lastSeen ? new Date(friend.lastSeen).toLocaleDateString() : 'recently'}`}</small>{callError && <small className="chat-call-error">{callError}</small>}</span></div><div className="chat-actions"><button disabled={startingCall} onClick={() => void beginCall('voice')} aria-label="Start voice call"><Phone /></button><button disabled={startingCall} onClick={() => void beginCall('video')} aria-label="Start video call"><Video /></button><button disabled title="Coming soon" aria-label="Conversation options"><MoreHorizontal /></button></div></header>
      <div className="message-area">
        <div className="date-marker"><span>Today</span></div>
        {items.map((message) => {
          const mine = message.senderId === me.id;
          return <div className={`message-row ${mine ? 'mine' : ''}`} key={message.id}>{!mine && <Avatar user={friend} size="sm" />}<div className="message-bubble"><p>{message.messageText}</p><span>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{mine && <CheckCheck size={14} className={message.status === 'seen' ? 'seen' : ''} />}</span></div></div>;
        })}
        {typing[friend.id] && <div className="typing-bubble"><i /><i /><i /><span>{friend.username} {t('chats.typing')}</span></div>}
        <div ref={bottomRef} />
      </div>
      {messageError && <div className="message-send-error" role="alert">{messageError}</div>}
      <form className="chat-compose" onSubmit={(event) => void submit(event)}><button type="button" disabled title="Coming soon" aria-label="Attach file"><Paperclip /></button><input value={text} onFocus={() => getSocket()?.emit('typing:start', { receiverId: friend.id })} onBlur={() => getSocket()?.emit('typing:stop', { receiverId: friend.id })} onChange={(event) => { setText(event.target.value); getSocket()?.emit(event.target.value ? 'typing:start' : 'typing:stop', { receiverId: friend.id }); }} placeholder={t('chats.placeholder')} maxLength={4000} /><button type="button" disabled title="Coming soon" aria-label="Emoji"><Smile /></button><button type="button" disabled title="Coming soon" aria-label="Voice message"><Mic /></button><button className="send-button" disabled={sending || !text.trim()} aria-label="Send message"><Send /></button></form>
    </section>
  );
}
