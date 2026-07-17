export type UserStatus = 'online' | 'away' | 'busy' | 'offline';
export type FriendStatus = 'pending' | 'accepted' | 'rejected';
export type MessageStatus = 'sent' | 'delivered' | 'seen';
export type CallType = 'voice' | 'video' | 'group';
export type CallStatus = 'ringing' | 'answered' | 'declined' | 'missed' | 'ended';

export interface PublicUser {
  id: string;
  username: string;
  email?: string;
  avatar: string | null;
  bio: string | null;
  status: UserStatus;
  lastSeen: string | null;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  messageText: string;
  status: MessageStatus;
  createdAt: string;
}

export interface CallRecord {
  id: string;
  callerId: string;
  receiverId: string | null;
  roomId: string;
  callType: CallType;
  duration: number;
  status: CallStatus;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: 'friend_request' | 'friend_accepted' | 'message' | 'missed_call' | 'system';
  content: string;
  read: boolean;
  createdAt: string;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

