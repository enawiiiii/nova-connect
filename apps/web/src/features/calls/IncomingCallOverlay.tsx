import { Phone, PhoneOff, UsersRound, Video } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { playHangupTone, startIncomingRingtone, stopIncomingRingtone } from '../../lib/call-sounds';
import { getSocket } from '../../lib/socket';
import { useNovaStore } from '../../stores/nova.store';

export function IncomingCallOverlay() {
  const navigate = useNavigate();
  const incoming = useNovaStore((state) => state.incomingCall);
  const clear = useNovaStore((state) => state.clearIncomingCall);

  useEffect(() => {
    if (!incoming) return;
    startIncomingRingtone();
    if (navigator.vibrate) navigator.vibrate([250, 150, 250, 150, 500]);
    const timeout = window.setTimeout(clear, 45_000);
    return () => {
      window.clearTimeout(timeout);
      stopIncomingRingtone();
      if (navigator.vibrate) navigator.vibrate(0);
    };
  }, [clear, incoming]);

  if (!incoming) return null;

  const accept = () => {
    const target = `/app/call/${incoming.type}/${incoming.roomId}?mode=${incoming.group ? 'group' : 'individual'}`;
    stopIncomingRingtone();
    clear();
    navigate(target);
  };

  const decline = () => {
    getSocket()?.emit('call:decline', { callerId: incoming.caller.id, roomId: incoming.roomId });
    playHangupTone();
    clear();
  };

  return (
    <div className="incoming-call-backdrop" role="dialog" aria-modal="true" aria-label="مكالمة واردة">
      <section className="incoming-call-card glass-panel">
        <span className="incoming-signal"><i /><i /><i /></span>
        <Avatar user={incoming.caller} size="xl" showStatus />
        <span className="incoming-kind">
          {incoming.group ? <UsersRound /> : incoming.type === 'video' ? <Video /> : <Phone />}
          {incoming.group ? 'مكالمة جماعية واردة' : 'مكالمة واردة'} · {incoming.type === 'video' ? 'فيديو' : 'صوت'}
        </span>
        <h2>{incoming.caller.username}</h2>
        <p>{incoming.group ? 'يدعوك للانضمام إلى غرفة خاصة' : 'يريد التحدث معك الآن'}</p>
        <div className="incoming-actions">
          <button className="decline" onClick={decline}><PhoneOff /><span>رفض</span></button>
          <button className="accept" onClick={accept}>{incoming.type === 'video' ? <Video /> : <Phone />}<span>قبول</span></button>
        </div>
      </section>
    </div>
  );
}
