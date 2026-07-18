import type { Message } from '@nova/shared';
import { Ban, CheckCheck, FileText, Mic, MoreHorizontal, Paperclip, Pencil, Phone, Reply, Send, ShieldAlert, Smile, Square, Trash2, Video, X } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const [moderationMode, setModerationMode] = useState<'report' | 'block' | null>(null);
  const [reportReason, setReportReason] = useState<'spam' | 'harassment' | 'impersonation' | 'unsafe' | 'other'>('harassment');
  const [reportDetails, setReportDetails] = useState('');
  const [moderationBusy, setModerationBusy] = useState(false);
  const [moderationError, setModerationError] = useState('');
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
  useEffect(() => {
    if (!moderationMode) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !moderationBusy) setModerationMode(null); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [moderationBusy, moderationMode]);

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
  const openModeration = (mode: 'report' | 'block') => {
    setShowOptions(false);
    setModerationError('');
    setReportDetails('');
    setReportReason('harassment');
    setModerationMode(mode);
  };
  const blockFriend = async () => {
    if (!accessToken) return;
    setModerationBusy(true);
    setModerationError('');
    try {
      await api('/privacy/block', { method: 'POST', token: accessToken, body: { userId: friend.id } });
      useNovaStore.setState((state) => ({ friends: state.friends.filter((item) => item.id !== friend.id) }));
      setModerationMode(null);
      navigate('/app/friends', { replace: true });
    } catch (error) {
      setModerationError(error instanceof Error ? error.message : 'تعذر حظر المستخدم.');
    } finally {
      setModerationBusy(false);
    }
  };
  const reportFriend = async (event: FormEvent) => {
    event.preventDefault();
    if (!accessToken || reportDetails.trim().length < 3) return;
    setMessageError('');
    setMessageNotice('');
    setModerationError('');
    setModerationBusy(true);
    try {
      await api('/privacy/reports', { method: 'POST', token: accessToken, body: { userId: friend.id, reason: reportReason, details: reportDetails.trim() } });
      setMessageNotice('تم تسجيل البلاغ وسيظهر في لوحة الإدارة خلال 10 ثوانٍ.');
      setModerationMode(null);
      setReportDetails('');
    } catch (error) {
      setModerationError(error instanceof Error ? error.message : 'تعذر إرسال البلاغ.');
    } finally {
      setModerationBusy(false);
    }
  };

  return (
    <section className="chat-panel">
      <header className="chat-header">
        <div className="chat-person"><Avatar user={friend} size="md" showStatus /><span><strong>{friend.username}</strong><small>{friend.status === 'online' ? t('common.online') : `Last seen ${friend.lastSeen ? new Date(friend.lastSeen).toLocaleDateString() : 'recently'}`}</small>{callError && <small className="chat-call-error">{callError}</small>}</span></div>
        <div className="chat-actions"><button disabled={startingCall} onClick={() => void beginCall('voice')} aria-label="Start voice call"><Phone /></button><button disabled={startingCall} onClick={() => void beginCall('video')} aria-label="Start video call"><Video /></button><button title="خيارات المحادثة" aria-label="Conversation options" onClick={() => setShowOptions((value) => !value)}><MoreHorizontal /></button>{showOptions && <div className="chat-options-menu"><button onClick={() => openModeration('report')}>إبلاغ عن المستخدم</button><button className="danger" onClick={() => openModeration('block')}>حظر المستخدم</button></div>}</div>
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
      {moderationMode && createPortal(
        <div className="moderation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !moderationBusy) setModerationMode(null); }}>
          {moderationMode === 'report' ? (
            <form className="moderation-dialog glass-panel" role="dialog" aria-modal="true" aria-labelledby="report-title" onSubmit={(event) => void reportFriend(event)}>
              <header><span className="moderation-icon report"><ShieldAlert /></span><div><small>NOVA / SAFETY</small><h2 id="report-title">الإبلاغ عن {friend.username}</h2><p>أرسل التفاصيل لفريق الإدارة. لن يعرف المستخدم من أرسل البلاغ.</p></div><button type="button" className="moderation-close" disabled={moderationBusy} onClick={() => setModerationMode(null)} aria-label="إغلاق"><X /></button></header>
              <label><span>سبب البلاغ</span><select value={reportReason} onChange={(event) => setReportReason(event.target.value as typeof reportReason)}><option value="harassment">مضايقة أو إساءة</option><option value="spam">رسائل مزعجة أو احتيال</option><option value="impersonation">انتحال شخصية</option><option value="unsafe">سلوك أو محتوى غير آمن</option><option value="other">سبب آخر</option></select></label>
              <label><span>التفاصيل</span><textarea autoFocus required minLength={3} maxLength={1000} value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} placeholder="اشرح ما حدث بوضوح…" /><small>{reportDetails.length} / 1000</small></label>
              {moderationError && <div className="moderation-error" role="alert">{moderationError}</div>}
              <footer><button type="button" className="button button-ghost" disabled={moderationBusy} onClick={() => setModerationMode(null)}>إلغاء</button><button className="button button-primary" disabled={moderationBusy || reportDetails.trim().length < 3}>{moderationBusy ? 'جارٍ الإرسال…' : 'إرسال البلاغ'}</button></footer>
            </form>
          ) : (
            <section className="moderation-dialog glass-panel block-dialog" role="dialog" aria-modal="true" aria-labelledby="block-title">
              <header><span className="moderation-icon block"><Ban /></span><div><small>NOVA / PRIVACY</small><h2 id="block-title">حظر {friend.username}؟</h2><p>هذا الإجراء يحمي مساحتك ويمكنك إلغاء الحظر لاحقاً من الإعدادات.</p></div><button type="button" className="moderation-close" disabled={moderationBusy} onClick={() => setModerationMode(null)} aria-label="إغلاق"><X /></button></header>
              <div className="block-effects"><span>سيتم حذف الصداقة الحالية</span><span>ستتوقف الرسائل والمكالمات بينكما</span><span>لن يتم إشعار المستخدم بالحظر</span></div>
              {moderationError && <div className="moderation-error" role="alert">{moderationError}</div>}
              <footer><button type="button" className="button button-ghost" disabled={moderationBusy} onClick={() => setModerationMode(null)}>إلغاء</button><button type="button" className="button moderation-danger" disabled={moderationBusy} onClick={() => void blockFriend()}>{moderationBusy ? 'جارٍ الحظر…' : 'حظر المستخدم'}</button></footer>
            </section>
          )}
        </div>,
        document.body,
      )}
    </section>
  );
}
