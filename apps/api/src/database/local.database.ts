import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env, isLocalDevelopment } from '../config/env.js';

export interface LocalUser {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  avatar: string | null;
  bio: string | null;
  status: 'online' | 'away' | 'busy' | 'offline';
  last_seen: string | null;
  email_verified: boolean;
  created_at: string;
}

export interface LocalFriend {
  id: string;
  requester_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

export interface LocalMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  message_text: string;
  status: 'sent' | 'delivered' | 'seen';
  created_at: string;
}

export interface LocalCall {
  id: string;
  caller_id: string;
  receiver_id: string | null;
  room_id: string;
  call_type: 'voice' | 'video' | 'group';
  duration: number;
  status: 'ringing' | 'answered' | 'declined' | 'missed' | 'ended';
  participant_ids: string[];
  created_at: string;
}

export interface LocalNotification {
  id: string;
  user_id: string;
  type: 'friend_request' | 'friend_accepted' | 'message' | 'missed_call' | 'system';
  content: string;
  read: boolean;
  created_at: string;
}

export interface LocalToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface LocalState {
  users: LocalUser[];
  friends: LocalFriend[];
  messages: LocalMessage[];
  calls: LocalCall[];
  notifications: LocalNotification[];
  refreshTokens: LocalToken[];
  verificationTokens: LocalToken[];
}

const emptyState = (): LocalState => ({
  users: [], friends: [], messages: [], calls: [], notifications: [], refreshTokens: [], verificationTokens: [],
});

const dataPath = path.resolve(env.LOCAL_DATA_PATH);
let state: LocalState | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();

async function load() {
  if (!isLocalDevelopment) throw new Error('Local database is disabled');
  if (state) return state;
  try {
    state = JSON.parse(await readFile(dataPath, 'utf8')) as LocalState;
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : '';
    if (code !== 'ENOENT') throw error;
    state = emptyState();
    await persist(state);
  }
  return state;
}

async function persist(value: LocalState) {
  await mkdir(path.dirname(dataPath), { recursive: true });
  const temporaryPath = `${dataPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rename(temporaryPath, dataPath);
      return;
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : '';
      if (!['EPERM', 'EACCES'].includes(code) || attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
}

export const localDb = {
  async read<T>(reader: (current: LocalState) => T | Promise<T>): Promise<T> {
    await writeQueue;
    return reader(await load());
  },
  async mutate<T>(mutation: (current: LocalState) => T | Promise<T>): Promise<T> {
    const operation = writeQueue.then(async () => {
      const current = await load();
      const result = await mutation(current);
      await persist(current);
      return result;
    });
    writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  },
};
