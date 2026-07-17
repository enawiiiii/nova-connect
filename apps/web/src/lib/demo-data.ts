import type { AppNotification, CallRecord, Message, PublicUser } from '@nova/shared';
import { createId } from './platform';

export interface Friend extends PublicUser { friendshipId: string; unread?: number; lastMessage?: string; lastMessageAt?: string }
export interface FriendRequest { id: string; createdAt: string; user: PublicUser }

const now = Date.now();
export const demoFriends: Friend[] = [
  { friendshipId: 'f1', id: '6bd326e7-9230-4d4f-918d-20fde9d36f55', username: 'Lina', avatar: null, bio: 'Architect of small joys', status: 'online', lastSeen: new Date().toISOString(), unread: 2, lastMessage: 'That rooftop looks unreal ✨', lastMessageAt: new Date(now - 120_000).toISOString() },
  { friendshipId: 'f2', id: '05a8a66a-e579-486a-83b6-287d3eb53fbe', username: 'Omar', avatar: null, bio: 'Filmmaker · Amman → Dubai', status: 'online', lastSeen: new Date().toISOString(), lastMessage: 'Voice call later?', lastMessageAt: new Date(now - 1_800_000).toISOString() },
  { friendshipId: 'f3', id: '85354791-14c8-49d1-8828-c866e7c5ca2c', username: 'Maya', avatar: null, bio: 'Collecting sunsets', status: 'away', lastSeen: new Date(now - 3_600_000).toISOString(), lastMessage: 'Sent a photo', lastMessageAt: new Date(now - 10_800_000).toISOString() },
  { friendshipId: 'f4', id: '51a93cac-fbcb-4939-b17d-2fb92b39befc', username: 'Zayd', avatar: null, bio: 'Building strange, useful things', status: 'offline', lastSeen: new Date(now - 86_400_000).toISOString(), lastMessage: 'See you Saturday', lastMessageAt: new Date(now - 86_400_000).toISOString() },
  { friendshipId: 'f5', id: '28ab0c2d-b339-4fd3-8c0f-0187fa5df06a', username: 'Sara', avatar: null, bio: 'Ceramics and slow mornings', status: 'busy', lastSeen: new Date(now - 500_000).toISOString(), lastMessage: 'Perfect, I’m in', lastMessageAt: new Date(now - 172_800_000).toISOString() },
];

export const demoRequests: FriendRequest[] = [
  { id: 'r1', createdAt: new Date(now - 900_000).toISOString(), user: { id: '433c7c96-2987-45fb-8b59-284e833fe0ef', username: 'Yara', avatar: null, bio: 'Sound designer', status: 'online', lastSeen: new Date().toISOString() } },
];

export const demoMessages: Record<string, Message[]> = {
  [demoFriends[0]!.id]: [
    { id: 'm1', senderId: demoFriends[0]!.id, receiverId: 'c55467b0-3e1b-4207-a030-d85896754151', messageText: 'Are we still chasing the sunset tonight?', status: 'seen', createdAt: new Date(now - 3_600_000).toISOString() },
    { id: 'm2', senderId: 'c55467b0-3e1b-4207-a030-d85896754151', receiverId: demoFriends[0]!.id, messageText: 'Absolutely. I found a rooftop with the best view.', status: 'seen', createdAt: new Date(now - 3_480_000).toISOString() },
    { id: 'm3', senderId: demoFriends[0]!.id, receiverId: 'c55467b0-3e1b-4207-a030-d85896754151', messageText: 'That rooftop looks unreal ✨', status: 'delivered', createdAt: new Date(now - 120_000).toISOString() },
  ],
  [demoFriends[1]!.id]: [
    { id: 'm4', senderId: demoFriends[1]!.id, receiverId: 'c55467b0-3e1b-4207-a030-d85896754151', messageText: 'Voice call later?', status: 'seen', createdAt: new Date(now - 1_800_000).toISOString() },
  ],
};

export const demoCalls: CallRecord[] = [
  { id: 'c1', callerId: demoFriends[0]!.id, receiverId: 'c55467b0-3e1b-4207-a030-d85896754151', roomId: createId(), callType: 'video', duration: 1452, status: 'ended', createdAt: new Date(now - 7_200_000).toISOString() },
  { id: 'c2', callerId: 'c55467b0-3e1b-4207-a030-d85896754151', receiverId: demoFriends[1]!.id, roomId: createId(), callType: 'voice', duration: 367, status: 'ended', createdAt: new Date(now - 86_400_000).toISOString() },
  { id: 'c3', callerId: demoFriends[2]!.id, receiverId: 'c55467b0-3e1b-4207-a030-d85896754151', roomId: createId(), callType: 'video', duration: 0, status: 'missed', createdAt: new Date(now - 172_800_000).toISOString() },
];

export const demoNotifications: AppNotification[] = [
  { id: 'n1', userId: 'c55467b0-3e1b-4207-a030-d85896754151', type: 'friend_request', content: 'Yara sent you a friend request', read: false, createdAt: new Date(now - 900_000).toISOString() },
  { id: 'n2', userId: 'c55467b0-3e1b-4207-a030-d85896754151', type: 'message', content: 'Lina sent you a message', read: false, createdAt: new Date(now - 120_000).toISOString() },
];
