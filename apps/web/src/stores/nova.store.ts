import type { AppNotification, CallRecord, Message, PublicUser } from '@nova/shared';
import { create } from 'zustand';
import { api } from '../lib/api';
import { playHangupTone, stopAllCallLoops, stopIncomingRingtone } from '../lib/call-sounds';
import { demoCalls, demoFriends, demoMessages, demoNotifications, demoRequests, type Friend, type FriendRequest } from '../lib/demo-data';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { createId, notificationPermission, notificationsSupported } from '../lib/platform';
import { dismissPushTag } from '../lib/push';
import { useAuthStore } from './auth.store';

interface NovaState {
  friends: Friend[];
  requests: FriendRequest[];
  messages: Record<string, Message[]>;
  calls: CallRecord[];
  notifications: AppNotification[];
  typing: Record<string, boolean>;
  activeCallId: string | null;
  activeCallStartedAt: number | null;
  incomingCall: { caller: PublicUser; roomId: string; type: 'voice' | 'video'; group: boolean } | null;
  loaded: boolean;
  load: () => Promise<void>;
  openConversation: (userId: string) => Promise<void>;
  sendMessage: (receiverId: string, text: string) => Promise<void>;
  respondRequest: (id: string, action: 'accept' | 'reject') => Promise<void>;
  searchUsers: (query: string) => Promise<PublicUser[]>;
  sendRequest: (receiverId: string) => Promise<void>;
  removeFriend: (friendshipId: string) => Promise<void>;
  markNotificationsRead: () => Promise<void>;
  startCall: (receiverId: string | null, callType: 'voice' | 'video' | 'group', roomId: string, participantIds?: string[]) => Promise<void>;
  finishCall: (status?: 'ended' | 'declined' | 'missed') => Promise<void>;
  clearIncomingCall: () => void;
  reset: () => void;
}

const initial = { friends: [], requests: [], messages: {}, calls: [], notifications: [], typing: {}, loaded: false, activeCallId: null, activeCallStartedAt: null, incomingCall: null };
let novaLoadPromise: Promise<void> | null = null;
let novaGeneration = 0;

export const useNovaStore = create<NovaState>((set, get) => ({
  ...initial,
  load: async () => {
    if (get().loaded) return;
    if (novaLoadPromise) return novaLoadPromise;
    const generation = novaGeneration;
    const loadOperation = (async () => {
    const { demo, accessToken } = useAuthStore.getState();
    if (demo) {
      if (generation === novaGeneration) set({ friends: demoFriends, requests: demoRequests, messages: demoMessages, calls: demoCalls, notifications: demoNotifications, loaded: true });
      return;
    }
    if (!accessToken) return;
    const [friends, requests, calls, notifications] = await Promise.all([
      api<Friend[]>('/friends', { token: accessToken }), api<FriendRequest[]>('/friends/requests', { token: accessToken }), api<CallRecord[]>('/calls', { token: accessToken }), api<AppNotification[]>('/notifications', { token: accessToken }),
    ]);
    if (generation !== novaGeneration) return;
    set({ friends, requests, calls, notifications, loaded: true });
    const socket = connectSocket(accessToken);
    const syncCalls = async () => {
      const currentToken = useAuthStore.getState().accessToken;
      const currentUser = useAuthStore.getState().user;
      if (!currentToken || !currentUser) return;
      try {
        const latestCalls = await api<CallRecord[]>('/calls', { token: currentToken });
        const ringing = latestCalls.find((call) => call.status === 'ringing' && call.receiverId === currentUser.id && call.callType !== 'group');
        set((state) => {
          const caller = ringing ? state.friends.find((friend) => friend.id === ringing.callerId) : undefined;
          return {
            calls: latestCalls,
            ...(ringing && caller && !window.location.pathname.includes(ringing.roomId) ? {
              incomingCall: {
                caller,
                roomId: ringing.roomId,
                type: ringing.callType as 'voice' | 'video',
                group: false,
              },
            } : {}),
          };
        });
      } catch {
        // The next reconnect or manual reload will retry without clearing the session.
      }
    };
    socket.on('connect', () => { void syncCalls(); });
    void syncCalls();
    socket.off('message:new').on('message:new', (message: Message) => {
      const me = useAuthStore.getState().user?.id;
      const otherId = message.senderId === me ? message.receiverId : message.senderId;
      const isOpenIncoming = message.senderId !== me && window.location.pathname.endsWith(`/chats/${message.senderId}`);
      const localMessage = isOpenIncoming ? { ...message, status: 'seen' as const } : message;
      set((state) => ({ messages: { ...state.messages, [otherId]: [...(state.messages[otherId] ?? []), localMessage] } }));
      if (isOpenIncoming) socket.emit('message:seen', { senderId: message.senderId });
    });
    socket.off('message:seen').on('message:seen', ({ messageIds }: { messageIds: string[] }) => set((state) => ({ messages: Object.fromEntries(Object.entries(state.messages).map(([id, items]) => [id, items.map((message) => messageIds.includes(message.id) ? { ...message, status: 'seen' as const } : message)])) })));
    socket.off('typing:update').on('typing:update', ({ userId, typing }: { userId: string; typing: boolean }) => set((state) => ({ typing: { ...state.typing, [userId]: typing } })));
    socket.off('presence:update').on('presence:update', ({ userId, status, lastSeen }: { userId: string; status: PublicUser['status']; lastSeen?: string }) => set((state) => ({ friends: state.friends.map((friend) => friend.id === userId ? { ...friend, status, lastSeen: lastSeen ?? friend.lastSeen } : friend) })));
    socket.off('call:incoming').on('call:incoming', ({ caller, roomId, type, group }: { caller: PublicUser; roomId: string; type: 'voice' | 'video'; group?: boolean }) => {
      set({ incomingCall: { caller, roomId, type, group: Boolean(group) } });
      set((state) => ({ notifications: [{ id: createId(), userId: useAuthStore.getState().user!.id, type: 'system', content: `${caller.username} is calling`, read: false, createdAt: new Date().toISOString() }, ...state.notifications] }));
      if (notificationsSupported() && notificationPermission() === 'granted') new Notification(`${caller.username} is calling`, { body: `Incoming ${type} call`, icon: '/pwa-192.png', tag: roomId });
    });
    socket.off('call:declined').on('call:declined', ({ username, roomId }: { username: string; roomId: string }) => {
      void dismissPushTag(`call-${roomId}`);
      playHangupTone();
      set((state) => ({ notifications: [{ id: createId(), userId: useAuthStore.getState().user!.id, type: 'system', content: `${username} declined the call`, read: false, createdAt: new Date().toISOString() }, ...state.notifications] }));
      if (window.location.pathname.includes(roomId)) {
        window.dispatchEvent(new CustomEvent('nova:call-declined', { detail: { username } }));
      } else {
        const active = get().calls.find((call) => call.id === get().activeCallId);
        if (active?.roomId === roomId && active.callType !== 'group') void get().finishCall('declined').catch(() => undefined);
      }
    });
    socket.off('call:ended').on('call:ended', ({ roomId, username }: { roomId: string; username: string }) => {
      void dismissPushTag(`call-${roomId}`);
      stopIncomingRingtone();
      playHangupTone();
      set((state) => ({
        incomingCall: state.incomingCall?.roomId === roomId ? null : state.incomingCall,
        calls: state.calls.map((call) => call.roomId === roomId && call.status !== 'missed' && call.status !== 'declined' ? { ...call, status: 'ended' as const } : call),
      }));
      if (!window.location.pathname.includes(roomId)) {
        set((state) => ({ notifications: [{
          id: createId(),
          userId: useAuthStore.getState().user!.id,
          type: 'system',
          content: `${username} أنهى المكالمة`,
          read: false,
          createdAt: new Date().toISOString(),
        }, ...state.notifications] }));
      }
    });
    socket.off('notification:new').on('notification:new', (notification: AppNotification) => set((state) => ({ notifications: [notification, ...state.notifications] })));
    socket.off('connect_error').on('connect_error', (reason) => {
      if (reason.message === 'Authentication failed') {
        const token = useAuthStore.getState().accessToken;
        if (token) void api<PublicUser>('/users/me', { token }).catch(() => undefined);
      }
    });
    })();
    novaLoadPromise = loadOperation;
    return loadOperation.finally(() => {
      if (novaLoadPromise === loadOperation) novaLoadPromise = null;
    });
  },
  openConversation: async (userId) => {
    if (get().messages[userId]) return;
    const { demo, accessToken } = useAuthStore.getState();
    if (demo || !accessToken) return set((state) => ({ messages: { ...state.messages, [userId]: [] } }));
    const messages = await api<Message[]>(`/messages/${userId}`, { token: accessToken });
    set((state) => ({ messages: { ...state.messages, [userId]: messages } }));
    connectSocket(accessToken).emit('message:seen', { senderId: userId });
  },
  sendMessage: async (receiverId, text) => {
    const { demo, user, accessToken } = useAuthStore.getState();
    if (!user) return;
    if (demo) {
      const message: Message = { id: createId(), senderId: user.id, receiverId, messageText: text, status: 'sent', createdAt: new Date().toISOString() };
      set((state) => ({ messages: { ...state.messages, [receiverId]: [...(state.messages[receiverId] ?? []), message] } }));
      return;
    }
    if (!accessToken) throw new Error('Your session is not ready. Please try again.');
    const response = await connectSocket(accessToken).timeout(10_000).emitWithAck('message:send', { receiverId, text }) as { data?: Message; error?: string };
    if (response.error) throw new Error(response.error);
  },
  respondRequest: async (id, action) => {
    const { demo, accessToken } = useAuthStore.getState();
    const request = get().requests.find((item) => item.id === id);
    if (!demo && accessToken) await api(`/friends/requests/${id}`, { method: 'PATCH', token: accessToken, body: { action } });
    set((state) => ({ requests: state.requests.filter((item) => item.id !== id), friends: action === 'accept' && request ? [...state.friends, { friendshipId: id, ...request.user }] : state.friends }));
  },
  searchUsers: async (query) => {
    const { demo, accessToken } = useAuthStore.getState();
    if (demo) return demoFriends.filter((friend) => friend.username.toLowerCase().includes(query.toLowerCase()));
    return accessToken ? api<PublicUser[]>(`/users/search?q=${encodeURIComponent(query)}`, { token: accessToken }) : [];
  },
  sendRequest: async (receiverId) => {
    const { demo, accessToken } = useAuthStore.getState();
    if (!demo && accessToken) await api('/friends/requests', { method: 'POST', token: accessToken, body: { receiverId } });
  },
  removeFriend: async (friendshipId) => {
    const { demo, accessToken } = useAuthStore.getState();
    if (!demo && accessToken) await api(`/friends/${friendshipId}`, { method: 'DELETE', token: accessToken });
    set((state) => ({ friends: state.friends.filter((friend) => friend.friendshipId !== friendshipId) }));
  },
  markNotificationsRead: async () => {
    const { demo, accessToken } = useAuthStore.getState();
    if (!demo && accessToken) await api('/notifications/read-all', { method: 'PATCH', token: accessToken });
    set((state) => ({ notifications: state.notifications.map((item) => ({ ...item, read: true })) }));
  },
  startCall: async (receiverId, callType, roomId, participantIds = []) => {
    const { demo, accessToken } = useAuthStore.getState();
    if (demo || !accessToken) return set({ activeCallId: null, activeCallStartedAt: Date.now() });
    const call = await api<CallRecord>('/calls', { method: 'POST', token: accessToken, body: { receiverId, participantIds, callType, roomId } });
    set((state) => ({ activeCallId: call.id, activeCallStartedAt: Date.now(), calls: [call, ...state.calls] }));
  },
  finishCall: async (status = 'ended') => {
    const { activeCallId, activeCallStartedAt } = get();
    const { demo, accessToken } = useAuthStore.getState();
    if (activeCallId && accessToken && !demo) {
      const duration = Math.max(0, Math.floor((Date.now() - (activeCallStartedAt ?? Date.now())) / 1000));
      const updated = await api<CallRecord>(`/calls/${activeCallId}`, { method: 'PATCH', token: accessToken, body: { duration, status } });
      set((state) => ({ calls: state.calls.map((call) => call.id === updated.id ? updated : call), activeCallId: null, activeCallStartedAt: null }));
    } else set({ activeCallId: null, activeCallStartedAt: null });
  },
  clearIncomingCall: () => set({ incomingCall: null }),
  reset: () => {
    novaGeneration += 1;
    novaLoadPromise = null;
    stopAllCallLoops();
    disconnectSocket();
    set(initial);
  },
}));
