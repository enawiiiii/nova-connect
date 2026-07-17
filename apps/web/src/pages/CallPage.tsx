import { Camera, CameraOff, Copy, Mic, MicOff, MonitorUp, PhoneOff, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { useWebRtcRoom } from '../hooks/useWebRtcRoom';
import { copyText } from '../lib/platform';
import { connectSocket } from '../lib/socket';
import { useAuthStore } from '../stores/auth.store';
import { useNovaStore } from '../stores/nova.store';
import { secureVersionUrl } from '../lib/secure-url';

function RemoteVideo({ stream, username }: { stream: MediaStream; username: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    return () => { video.srcObject = null; };
  }, [stream]);
  return <div className="remote-video"><video autoPlay playsInline ref={videoRef} /><span>{username}</span></div>;
}

export function CallPage() {
  const { type = 'video', roomId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, demo, accessToken } = useAuthStore();
  const finishCall = useNovaStore((state) => state.finishCall);
  const [declinedBy, setDeclinedBy] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [socketReady, setSocketReady] = useState(demo);
  const callType = type === 'voice' ? 'voice' : 'video';
  const isGroup = searchParams.get('mode') === 'group';
  const secureTarget = secureVersionUrl('/login');

  useEffect(() => {
    if (demo) {
      setSocketReady(true);
      return;
    }
    if (accessToken) {
      connectSocket(accessToken);
      setSocketReady(true);
    }
  }, [accessToken, demo]);

  const rtc = useWebRtcRoom(roomId, callType, demo, socketReady);

  useEffect(() => {
    if (!rtc.endedBy || isGroup || leaving) return;
    setLeaving(true);
    const returnToCalls = async () => {
      try {
        await finishCall();
      } finally {
        navigate('/app/calls', { replace: true, state: { notice: `${rtc.endedBy} أنهى المكالمة.` } });
      }
    };
    void returnToCalls();
  }, [finishCall, isGroup, leaving, navigate, rtc.endedBy]);

  useEffect(() => {
    const onDeclined = (event: Event) => {
      setDeclinedBy((event as CustomEvent<{ username: string }>).detail.username);
    };
    window.addEventListener('nova:call-declined', onDeclined);
    return () => window.removeEventListener('nova:call-declined', onDeclined);
  }, []);

  useEffect(() => {
    if (!declinedBy || isGroup || leaving) return;
    setLeaving(true);
    rtc.leaveRoom();
    void finishCall('declined').finally(() => {
      navigate('/app/calls', { replace: true, state: { notice: `${declinedBy} رفض المكالمة.` } });
    });
  }, [declinedBy, finishCall, isGroup, leaving, navigate, rtc]);

  useEffect(() => {
    if (isGroup || leaving || !rtc.joined || rtc.remotePeers.length > 0 || rtc.error) return;
    const timer = window.setTimeout(() => {
      setLeaving(true);
      rtc.leaveRoom();
      void finishCall('missed').finally(() => {
        navigate('/app/calls', { replace: true, state: { notice: 'لم يتم الرد على المكالمة.' } });
      });
    }, 45_000);
    return () => window.clearTimeout(timer);
  }, [finishCall, isGroup, leaving, navigate, rtc]);

  const leave = async () => {
    if (leaving) return;
    setLeaving(true);
    rtc.leaveRoom();
    try {
      await finishCall();
    } finally {
      navigate('/app/calls');
    }
  };

  return (
    <div className="call-page">
      <div className="call-ambient" />
      <header>
        <div>
          <span className="brand-orbit"><span>N</span><i /></span>
          <span><strong>{isGroup ? 'NOVA Group Room' : 'NOVA Direct Call'}</strong><small><ShieldCheck />{isGroup ? 'مكالمة جماعية آمنة' : 'مكالمة فردية بين شخصين'}</small></span>
        </div>
        <button className="room-code" onClick={() => void copyText(window.location.href)}>ROOM {roomId.slice(0, 6).toUpperCase()} <Copy /></button>
        <span className="participant-count">{rtc.remotePeers.length + 1} / {isGroup ? 8 : 2} مشاركين</span>
      </header>

      <main className={`video-grid count-${rtc.remotePeers.length + 1}`}>
        <div className={`local-video ${rtc.cameraOff ? 'camera-off' : ''}`}>
          <video ref={rtc.localVideo} muted autoPlay playsInline />
          {rtc.cameraOff && <div><Avatar user={user!} size="xl" /><span className="voice-wave"><i /><i /><i /><i /></span></div>}
          <span>{t('common.you', { defaultValue: 'أنت' })}</span>
        </div>
        {rtc.remotePeers.map((peer) => <RemoteVideo key={peer.userId} stream={peer.stream} username={peer.username} />)}
        {rtc.remotePeers.length === 0 && (
          <div className="waiting-card">
            <div className="waiting-orbit"><Sparkles /><i /><i /></div>
            <h2>{rtc.joined ? (isGroup ? t('call.inviting') : 'بانتظار قبول صديقك…') : 'جارٍ تجهيز المكالمة…'}</h2>
            <p>{isGroup ? 'هذه غرفة جماعية يمكن أن تضم حتى 8 مشاركين.' : 'هذه مكالمة فردية خاصة بينك وبين شخص واحد فقط.'}</p>
            {declinedBy && <strong>{declinedBy} رفض المكالمة.</strong>}
            {rtc.error && <strong>{rtc.error}</strong>}
            {!window.isSecureContext && secureTarget && <a className="secure-call-link" href={secureTarget}><ShieldCheck />فتح رابط HTTPS الآمن للآيفون</a>}
          </div>
        )}
      </main>

      <footer className="call-controls">
        <button className={rtc.muted ? 'off' : ''} onClick={rtc.toggleMute}>{rtc.muted ? <MicOff /> : <Mic />}<span>{t('call.mute')}</span></button>
        {callType === 'video' && <button className={rtc.cameraOff ? 'off' : ''} onClick={rtc.toggleCamera}>{rtc.cameraOff ? <CameraOff /> : <Camera />}<span>{t('call.camera')}</span></button>}
        {rtc.supportsScreenShare && <button onClick={() => void rtc.shareScreen()}><MonitorUp /><span>{t('call.share')}</span></button>}
        <button className="leave" disabled={leaving} onClick={() => void leave()}><PhoneOff /><span>{t('call.leave')}</span></button>
      </footer>
    </div>
  );
}
