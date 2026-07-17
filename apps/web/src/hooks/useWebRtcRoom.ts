import { useCallback, useEffect, useRef, useState } from 'react';
import { api, leaveCallKeepalive } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuthStore } from '../stores/auth.store';

interface RemotePeer {
  userId: string;
  username: string;
  stream: MediaStream;
}

const fallbackIceServers: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

function mediaErrorMessage(error: unknown) {
  if (!window.isSecureContext) return 'يلزم فتح NOVA عبر رابط HTTPS آمن لاستخدام الكاميرا والميكروفون.';
  if (!navigator.mediaDevices?.getUserMedia) return 'هذا المتصفح لا يدعم مكالمات الصوت والفيديو.';
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'اسمح لـ NOVA باستخدام الكاميرا والميكروفون من إعدادات المتصفح.';
  if (name === 'NotFoundError') return 'لم يتم العثور على كاميرا أو ميكروفون متاح.';
  if (name === 'NotReadableError') return 'الكاميرا أو الميكروفون مستخدمان من تطبيق آخر.';
  return 'تعذر تشغيل الكاميرا أو الميكروفون. تحقق من الأذونات وحاول مجددًا.';
}

export function useWebRtcRoom(roomId: string, type: 'voice' | 'video', demo: boolean, enabled = true) {
  const localVideo = useRef<HTMLVideoElement>(null);
  const localStream = useRef<MediaStream | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const iceServers = useRef<RTCIceServer[]>(fallbackIceServers);
  const pendingCandidates = useRef(new Map<string, RTCIceCandidateInit[]>());
  const leaveRoomAction = useRef<() => void>(() => undefined);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(type === 'voice');
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [endedBy, setEndedBy] = useState<string | null>(null);
  const supportsScreenShare = Boolean(navigator.mediaDevices?.getDisplayMedia);

  const createPeer = useCallback((userId: string, username = 'Friend') => {
    const existing = peers.current.get(userId);
    if (existing) return existing;

    const peer = new RTCPeerConnection({ iceServers: iceServers.current });
    localStream.current?.getTracks().forEach((track) => peer.addTrack(track, localStream.current!));
    peer.onicecandidate = ({ candidate }) => {
      if (candidate) getSocket()?.emit('webrtc:signal', { roomId, targetUserId: userId, candidate });
    };
    peer.ontrack = ({ streams }) => {
      const stream = streams[0];
      if (stream) {
        setRemotePeers((items) => [
          ...items.filter((item) => item.userId !== userId),
          { userId, username, stream },
        ]);
      }
    };
    peer.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(peer.connectionState)) {
        setRemotePeers((items) => items.filter((item) => item.userId !== userId));
      }
    };
    peers.current.set(userId, peer);
    return peer;
  }, [roomId]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const socket = getSocket();
    const peerMap = peers.current;
    const candidateMap = pendingCandidates.current;
    const token = useAuthStore.getState().accessToken;
    let hasJoined = demo;
    let leaveSent = false;
    let joining = false;
    let joinedSocketId: string | undefined;

    const notifyLeave = () => {
      if (!hasJoined || leaveSent) return;
      leaveSent = true;
      socket?.emit('call:leave', { roomId });
      if (!demo && token) void leaveCallKeepalive(roomId, token).catch(() => undefined);
    };
    leaveRoomAction.current = notifyLeave;

    const flushCandidates = async (userId: string, peer: RTCPeerConnection) => {
      const queued = pendingCandidates.current.get(userId) ?? [];
      pendingCandidates.current.delete(userId);
      for (const candidate of queued) await peer.addIceCandidate(candidate);
    };

    const onSignal = async ({
      fromUserId,
      fromUsername,
      description,
      candidate,
    }: {
      fromUserId: string;
      fromUsername: string;
      description?: RTCSessionDescriptionInit;
      candidate?: RTCIceCandidateInit;
    }) => {
      try {
        const peer = createPeer(fromUserId, fromUsername);
        if (description) {
          await peer.setRemoteDescription(description);
          await flushCandidates(fromUserId, peer);
          if (description.type === 'offer') {
            await peer.setLocalDescription(await peer.createAnswer());
            socket?.emit('webrtc:signal', {
              roomId,
              targetUserId: fromUserId,
              description: peer.localDescription,
            });
          }
        }
        if (candidate) {
          if (peer.remoteDescription) await peer.addIceCandidate(candidate);
          else {
            const queued = pendingCandidates.current.get(fromUserId) ?? [];
            queued.push(candidate);
            pendingCandidates.current.set(fromUserId, queued);
          }
        }
      } catch (cause) {
        console.error('WebRTC signaling failed', cause);
        if (active) setError('تعذر إنشاء الاتصال الآمن مع أحد المشاركين.');
      }
    };

    const onLeft = ({ userId }: { userId: string }) => {
      peers.current.get(userId)?.close();
      peers.current.delete(userId);
      pendingCandidates.current.delete(userId);
      setRemotePeers((items) => items.filter((item) => item.userId !== userId));
    };
    const onEnded = ({ username }: { username: string }) => {
      leaveSent = true;
      hasJoined = false;
      peerMap.forEach((peer) => peer.close());
      peerMap.clear();
      candidateMap.clear();
      localStream.current?.getTracks().forEach((track) => track.stop());
      localStream.current = null;
      setRemotePeers([]);
      setEndedBy(username || 'الطرف الآخر');
    };

    const joinRoom = () => {
      if (!socket?.connected || joining || joinedSocketId === socket.id || leaveSent) return;
      joining = true;
      socket.emit('call:join', { roomId }, async ({ data, error: joinError }: { data?: { participants: string[] }; error?: string }) => {
        joining = false;
        if (!active) return;
        if (joinError) {
          setError(joinError === 'This call has already ended' ? 'انتهت هذه المكالمة بالفعل.' : joinError);
          return;
        }
        joinedSocketId = socket.id;
        hasJoined = true;
        setJoined(true);
        for (const userId of data?.participants ?? []) {
          const peer = createPeer(userId);
          await peer.setLocalDescription(await peer.createOffer());
          socket.emit('webrtc:signal', {
            roomId,
            targetUserId: userId,
            description: peer.localDescription,
          });
        }
      });
    };
    const onConnect = () => {
      if (localStream.current) joinRoom();
    };

    socket?.on('webrtc:signal', onSignal);
    socket?.on('call:participant-left', onLeft);
    socket?.on('call:ended', onEnded);
    socket?.on('connect', onConnect);
    window.addEventListener('pagehide', notifyLeave);

    const start = async () => {
      try {
        if (!demo && token) {
          try {
            iceServers.current = await api<RTCIceServer[]>('/calls/ice-servers', { token });
          } catch {
            iceServers.current = fallbackIceServers;
          }
        }
        if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('Media devices unavailable', 'NotSupportedError');
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: type === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStream.current = stream;
        if (localVideo.current) {
          localVideo.current.srcObject = stream;
          void localVideo.current.play().catch(() => undefined);
        }
        if (demo || !socket) {
          setJoined(true);
          return;
        }
        joinRoom();
      } catch (cause) {
        if (active) {
          setError(mediaErrorMessage(cause));
          if (!demo && token && !leaveSent) {
            leaveSent = true;
            socket?.emit('call:leave', { roomId });
            void leaveCallKeepalive(roomId, token).catch(() => undefined);
          }
        }
      }
    };

    void start();
    return () => {
      active = false;
      notifyLeave();
      leaveRoomAction.current = () => undefined;
      socket?.off('webrtc:signal', onSignal);
      socket?.off('call:participant-left', onLeft);
      socket?.off('call:ended', onEnded);
      socket?.off('connect', onConnect);
      window.removeEventListener('pagehide', notifyLeave);
      localStream.current?.getTracks().forEach((track) => track.stop());
      localStream.current = null;
      peerMap.forEach((peer) => peer.close());
      peerMap.clear();
      candidateMap.clear();
    };
  }, [createPeer, demo, enabled, roomId, type]);

  const toggleMute = () => {
    const next = !muted;
    localStream.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  };

  const toggleCamera = () => {
    const next = !cameraOff;
    localStream.current?.getVideoTracks().forEach((track) => { track.enabled = !next; });
    setCameraOff(next);
  };

  const shareScreen = async () => {
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen sharing is unavailable');
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = screen.getVideoTracks()[0];
      if (!track) return;
      peers.current.forEach((peer) => {
        void peer.getSenders().find((sender) => sender.track?.kind === 'video')?.replaceTrack(track);
      });
      track.onended = () => {
        const camera = localStream.current?.getVideoTracks()[0];
        if (camera) {
          peers.current.forEach((peer) => {
            void peer.getSenders().find((sender) => sender.track?.kind === 'video')?.replaceTrack(camera);
          });
        }
      };
    } catch {
      setError('مشاركة الشاشة غير متاحة على هذا الجهاز أو لم يتم السماح بها.');
    }
  };

  const leaveRoom = () => leaveRoomAction.current();

  return {
    localVideo,
    remotePeers,
    muted,
    cameraOff,
    error,
    joined,
    endedBy,
    supportsScreenShare,
    toggleMute,
    toggleCamera,
    shareScreen,
    leaveRoom,
  };
}
