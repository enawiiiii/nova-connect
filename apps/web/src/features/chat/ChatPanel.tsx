import type { Message } from '@nova/shared';
import { CheckCheck, FileText, Mic, MoreHorizontal, Paperclip, Pencil, Phone, Reply, Send, Smile, Square, Trash2, Video } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { api, ApiError } from '../../lib/api';
import type { Friend } from '../../lib/demo-data';
import { createId } from '../../lib/platform';
import { connectSocket, getSocket } from '../../lib/socket';
import { useAuthStore } from '../../stores/auth.store';
import { useNovaStore } from '../../stores/nova.store';

export function ChatPanel({ friend }: { friend: Friend }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useAuthStore((state) => state.user)!;
  const accessToken = useAuthStore((state) => state.accessToken);
  const {
    messages, typing, openConversation, sendMessage, sendAttachment, editMessage,
    deleteMessage, reactToMessage, startCall,
  } = useNovaStore();
  const [text, setText] = useState('');
  const [replying, setReplying] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [callError, setCallError] = useState('');
  const [startingCall, setStartingCall] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [messageNotice, setMessageNotice] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const items = messages[friend.id] ?? [];

  useEffect(() => {
    void openConversation(friend.id).catch((error) => {
      setMessageError(error instanceof Error ? error.message : 'تعذر تحميل المحادثة.');
    });
  }, [friend.id, openConversation]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [items.length, typing, friend.id]);
  useEffect(() => () => recordingStreamRef.current?.getTracks().forEach((track) => track.stop()), []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const clean = text.trim();
    if (!clean || sending) return;
    setSending(true);
    setMessageError('');
    try {
      if (editing) await editMessage(editing.id, clean);
      else await sendMessage(friend.id, clean, replying?.id);
      setText('');
      setEditing(null);
      setReplying(null);
      getSocket()?.emit('typing:stop', { receiverId: friend.id });
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : 'تعذر إرسال الرسالة.');
    } finally {
      setSending(false);
    }
  };

  const upload = async (file?: File) => {
    if (!file || sending) return;
    setSending(true);
    setMessageError('');
    try {
      await sendAttachment(friend.id, file, text.trim(), replying?.id);
      setText('');
      setReplying(null);
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : 'تعذر إرسال المرفق.');
    } finally {
      setSending(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recordingStreamRef.current = stream;
      recorder.ondataavailable = (event) => { if (event.data.size) audioChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const mime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mime });
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        if (blob.size) void upload(new File([blob], `voice-${Date.now()}.webm`, { type: mime }));
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setMessageError('اسمح لـ NOVA باستخدام الميكروفون لتسجيل رسالة صوتية.');
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

  const beginEdit = (message: Message) => {
    setEditing(message);
    setReplying(null);
    setText(message.messageText);
  };
  const blockFriend = async () => {
    if (!accessToken || !window.confirm(`حظر ${friend.username}؟ سيتم حذف الصداقة ومنع الرسائل والمكالمات.`)) return;
    await api('/privacy/block', { method: 'POST', token: accessToken, body: { userId: friend.id } });
    window.location.assign('/app/friends');
  };
  const reportFriend = async () => {
    if (!accessToken) return;
    const details = window.prompt('اكتب سبب البلاغ باختصار:');
    if (details === null) return;
    setMessageError('');
    setMessageNotice('');
    try {
      await api('/privacy/reports', { method: 'POST', token: accessToken, body: { userId: friend.id, reason: 'other', details } });
      setMessageNotice('تم تسجيل البلاغ وسيظهر في لوحة الإدارة خلال 10 ثوانٍ.');
      setShowOptions(false);
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : 'تعذر إرسال البلاغ.');
    }
  };

  return (
    <section className="chat-panel">
      <header className="chat-header">
        <div className="chat-person"><Avatar user={friend} size="md" showStatus /><span><strong>{friend.username}</strong><small>{friend.status === 'online' ? t('common.online') : `Last seen ${friend.lastSeen ? new Date(friend.lastSeen).toLocaleDateString() : 'recently'}`}</small>{callError && <small className="chat-call-error">{callError}</small>}</span></div>
        <div className="chat-actions"><button disabled={startingCall} onClick={() => void beginCall('voice')} aria-label="Start voice call"><Phone /></button><button disabled={startingCall} onClick={() => void beginCall('video')} aria-label="Start video call"><Video /></button><button title="خيارات المحادثة" aria-label="Conversation options" onClick={() => setShowOptions((value) => !value)}><MoreHorizontal /></button>{showOptions && <div className="chat-options-menu"><button onClick={() => void reportFriend()}>إبلاغ عن المستخدم</button><button className="danger" onClick={() => void blockFriend()}>حظر المستخدم</button></div>}</div>
      </header>
      <div className="message-area">
        <div className="date-marker"><span>Today</span></div>
        {items.map((message) => {
          const mine = message.senderId === me.id;
          const replied = message.replyToId ? items.find((item) => item.id === message.replyToId) : undefined;
          return (
            <div className={`message-row ${mine ? 'mine' : ''}`} key={message.id}>
              {!mine && <Avatar user={friend} size="sm" />}
              <div className={`message-bubble ${message.deletedAt ? 'deleted' : ''}`}>
                {replied && <button className="reply-preview" onClick={() => document.getElementById(`message-${replied.id}`)?.scrollIntoView({ behavior: 'smooth' })}><Reply />{replied.deletedAt ? 'رسالة محذوفة' : replied.messageText || replied.attachmentName || 'مرفق'}</button>}
                <div id={`message-${message.id}`}>
                  {message.deletedAt ? <p className="deleted-copy">تم حذف هذه الرسالة</p> : <>
                    {message.messageType === 'image' && message.attachmentUrl && <a href={message.attachmentUrl} target="_blank" rel="noreferrer"><img className="message-image" src={message.attachmentUrl} alt={message.attachmentName ?? 'صورة'} /></a>}
                    {message.messageType === 'audio' && message.attachmentUrl && <audio className="message-audio" controls preload="metadata" src={message.attachmentUrl} />}
                    {message.messageType === 'file' && message.attachmentUrl && <a className="message-file" href={message.attachmentUrl} target="_blank" rel="noreferrer"><FileText />{message.attachmentName ?? 'فتح الملف'}</a>}
                    {message.messageText && <p>{message.messageText}</p>}
                  </>}
                </div>
                {!message.deletedAt && <div className="message-actions"><button onClick={() => setReplying(message)} title="رد"><Reply /></button><button onClick={() => void reactToMessage(message.id, '❤️')} title="تفاعل">❤️</button>{mine && <><button onClick={() => beginEdit(message)} title="تعديل"><Pencil /></button><button onClick={() => void deleteMessage(message.id)} title="حذف"><Trash2 /></button></>}</div>}
                {Boolean(message.reactions?.length) && <div className="message-reactions">{message.reactions!.map((reaction) => <button key={reaction.emoji} className={reaction.userIds.includes(me.id) ? 'mine' : ''} onClick={() => void reactToMessage(message.id, reaction.emoji)}>{reaction.emoji} {reaction.userIds.length}</button>)}</div>}
                <span>{message.editedAt && 'معدلة · '}{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{mine && <CheckCheck size={14} className={message.status === 'seen' ? 'seen' : ''} />}</span>
              </div>
            </div>
          );
        })}
        {typing[friend.id] && <div className="typing-bubble"><i /><i /><i /><span>{friend.username} {t('chats.typing')}</span></div>}
        <div ref={bottomRef} />
      </div>
      {messageError && <div className="message-send-error" role="alert">{messageError}</div>}
      {messageNotice && <div className="message-send-notice" role="status">{messageNotice}</div>}
      {(replying || editing) && <div className="compose-context"><span>{editing ? 'تعديل الرسالة' : `رد على: ${replying?.messageText || replying?.attachmentName || 'مرفق'}`}</span><button onClick={() => { setReplying(null); setEditing(null); setText(''); }}>×</button></div>}
      <form className="chat-compose" onSubmit={(event) => void submit(event)}>
        <input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif,audio/*,application/pdf" onChange={(event) => void upload(event.target.files?.[0])} />
        <button type="button" disabled={sending} onClick={() => fileRef.current?.click()} title="إرسال صورة أو ملف"><Paperclip /></button>
        <input value={text} onFocus={() => getSocket()?.emit('typing:start', { receiverId: friend.id })} onBlur={() => getSocket()?.emit('typing:stop', { receiverId: friend.id })} onChange={(event) => { setText(event.target.value); getSocket()?.emit(event.target.value ? 'typing:start' : 'typing:stop', { receiverId: friend.id }); }} placeholder={recording ? 'جارٍ تسجيل الرسالة الصوتية…' : t('chats.placeholder')} maxLength={4000} />
        <button type="button" onClick={() => setText((value) => `${value} 😊`)} title="إيموجي"><Smile /></button>
        <button type="button" className={recording ? 'recording' : ''} disabled={sending} onClick={() => void toggleRecording()} title={recording ? 'إيقاف التسجيل' : 'رسالة صوتية'}>{recording ? <Square /> : <Mic />}</button>
        <button className="send-button" disabled={sending || !text.trim()} aria-label="Send message"><Send /></button>
      </form>
    </section>
  );
}
