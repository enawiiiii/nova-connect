import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { env, isLocalDevelopment } from '../config/env.js';
import { db } from '../database/supabase.js';
import { localDb, type LocalUser } from '../database/local.database.js';
import { AppError } from '../utils/errors.js';
import { mapUser } from '../utils/mappers.js';
import { createOpaqueToken, hashToken, signAccessToken } from './token.service.js';
import { localVerificationPath, sendVerificationEmail } from './mail.service.js';

interface Credentials { email: string; password: string }
interface RegisterInput extends Credentials { username: string }
const refreshRotationGraceMs = 30_000;

async function createSession(user: { id: string; email: string; username: string }) {
  const refreshToken = createOpaqueToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000);
  if (isLocalDevelopment) {
    await localDb.mutate((state) => state.refreshTokens.push({
      id: crypto.randomUUID(), user_id: user.id, token_hash: hashToken(refreshToken), expires_at: expiresAt.toISOString(), revoked_at: null, created_at: new Date().toISOString(),
    }));
    return { accessToken: signAccessToken(user), refreshToken, expiresAt };
  }
  const { error } = await db.from('refresh_tokens').insert({
    user_id: user.id,
    token_hash: hashToken(refreshToken),
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw new AppError(500, 'Could not create session', 'SESSION_CREATE_FAILED');
  return { accessToken: signAccessToken(user), refreshToken, expiresAt };
}

async function createVerification(user: { id: string; email: string; username: string }) {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  if (isLocalDevelopment) {
    await localDb.mutate((state) => {
      state.verificationTokens.forEach((stored) => {
        if (stored.user_id === user.id && !stored.revoked_at) stored.revoked_at = new Date().toISOString();
      });
      state.verificationTokens.push({
        id: crypto.randomUUID(),
        user_id: user.id,
        token_hash: hashToken(token),
        expires_at: expiresAt,
        revoked_at: null,
        created_at: new Date().toISOString(),
      });
    });
  } else {
    await db.from('email_verification_tokens').update({ used_at: new Date().toISOString() }).eq('user_id', user.id).is('used_at', null);
    const { error } = await db.from('email_verification_tokens').insert({
      user_id: user.id,
      token_hash: hashToken(token),
      expires_at: expiresAt,
    });
    if (error) throw new AppError(500, 'Could not create verification link', 'VERIFICATION_CREATE_FAILED');
  }
  let emailSent = false;
  try {
    emailSent = await sendVerificationEmail(user.email, user.username, token);
  } catch (error) {
    emailSent = false;
    console.error('Could not send verification email', error);
  }
  return {
    emailSent,
    verificationUrl: isLocalDevelopment ? localVerificationPath(token) : undefined,
  };
}

export const authService = {
  async register(input: RegisterInput) {
    const email = input.email.trim().toLowerCase();
    const username = input.username.trim();
    if (isLocalDevelopment) {
      const existing = await localDb.read((state) => state.users.some((user) => user.email === email || user.username.toLowerCase() === username.toLowerCase()));
      if (existing) throw new AppError(409, 'Email or username is already in use', 'ACCOUNT_EXISTS');
      const createdAt = new Date().toISOString();
      const user: LocalUser = {
        id: crypto.randomUUID(), username, email, password_hash: await bcrypt.hash(input.password, env.BCRYPT_ROUNDS), avatar: null, bio: null, status: 'offline', last_seen: createdAt, email_verified: false, created_at: createdAt,
      };
      await localDb.mutate((state) => { state.users.push(user); });
      const verification = await createVerification(user);
      return { user: mapUser(user as unknown as Record<string, unknown>, true), ...verification };
    }
    const [{ data: existingEmail }, { data: existingUsername }] = await Promise.all([
      db.from('users').select('id').eq('email', email).maybeSingle(),
      db.from('users').select('id').eq('username', username).maybeSingle(),
    ]);
    if (existingEmail || existingUsername) throw new AppError(409, 'Email or username is already in use', 'ACCOUNT_EXISTS');

    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
    const { data, error } = await db.from('users').insert({ email, username, password_hash: passwordHash }).select('*').single();
    if (error || !data) throw new AppError(500, 'Could not create account', 'ACCOUNT_CREATE_FAILED');

    const verification = await createVerification({ id: data.id, email, username });
    return { user: mapUser(data, true), ...verification };
  },

  async login(input: Credentials) {
    if (isLocalDevelopment) {
      const email = input.email.trim().toLowerCase();
      const user = await localDb.read((state) => state.users.find((item) => item.email === email));
      if (!user || !(await bcrypt.compare(input.password, user.password_hash))) throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
      if (!user.email_verified) throw new AppError(403, 'Verify your email before signing in', 'EMAIL_NOT_VERIFIED');
      const session = await createSession(user);
      return { user: mapUser(user as unknown as Record<string, unknown>, true), ...session };
    }
    const { data, error } = await db.from('users').select('*').eq('email', input.email.trim().toLowerCase()).maybeSingle();
    if (error || !data || !(await bcrypt.compare(input.password, data.password_hash))) {
      throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }
    if (!data.email_verified) throw new AppError(403, 'Verify your email before signing in', 'EMAIL_NOT_VERIFIED');
    const session = await createSession({ id: data.id, email: data.email, username: data.username });
    return { user: mapUser(data, true), ...session };
  },

  async refresh(refreshToken?: string) {
    if (!refreshToken) throw new AppError(401, 'Refresh token is missing', 'MISSING_REFRESH_TOKEN');
    if (isLocalDevelopment) {
      const tokenHash = hashToken(refreshToken);
      const now = new Date().toISOString();
      const token = await localDb.read((state) => state.refreshTokens.find((item) => item.token_hash === tokenHash && (!item.revoked_at || item.revoked_at > now) && item.expires_at > now));
      if (!token) throw new AppError(401, 'Refresh token is invalid or expired', 'INVALID_REFRESH_TOKEN');
      const user = await localDb.read((state) => state.users.find((item) => item.id === token.user_id));
      if (!user) throw new AppError(401, 'Refresh token is invalid or expired', 'INVALID_REFRESH_TOKEN');
      if (!user.email_verified) throw new AppError(403, 'Verify your email before signing in', 'EMAIL_NOT_VERIFIED');
      await localDb.mutate((state) => {
        const stored = state.refreshTokens.find((item) => item.id === token.id);
        if (stored) stored.revoked_at = new Date(Date.now() + refreshRotationGraceMs).toISOString();
      });
      return createSession(user);
    }
    const now = new Date().toISOString();
    const { data } = await db.from('refresh_tokens').select('*, users(id,email,username,email_verified)').eq('token_hash', hashToken(refreshToken)).or(`revoked_at.is.null,revoked_at.gt.${now}`).gt('expires_at', now).maybeSingle();
    if (!data?.users) throw new AppError(401, 'Refresh token is invalid or expired', 'INVALID_REFRESH_TOKEN');
    const storedUser = data.users as unknown as { id: string; email: string; username: string; email_verified: boolean };
    if (!storedUser.email_verified) throw new AppError(403, 'Verify your email before signing in', 'EMAIL_NOT_VERIFIED');
    await db.from('refresh_tokens').update({ revoked_at: new Date(Date.now() + refreshRotationGraceMs).toISOString() }).eq('id', data.id);
    return createSession(storedUser);
  },

  async logout(refreshToken?: string) {
    if (isLocalDevelopment) {
      if (refreshToken) await localDb.mutate((state) => { const token = state.refreshTokens.find((item) => item.token_hash === hashToken(refreshToken)); if (token) token.revoked_at = new Date().toISOString(); });
      return;
    }
    if (refreshToken) await db.from('refresh_tokens').update({ revoked_at: new Date().toISOString() }).eq('token_hash', hashToken(refreshToken));
  },

  async verifyEmail(token: string) {
    if (isLocalDevelopment) {
      const tokenHash = hashToken(token);
      await localDb.mutate((state) => {
        const stored = state.verificationTokens.find((item) => item.token_hash === tokenHash);
        if (!stored) throw new AppError(400, 'Verification link is invalid or expired', 'INVALID_VERIFICATION_TOKEN');
        const user = state.users.find((item) => item.id === stored.user_id);
        if (!user) throw new AppError(400, 'Verification link is invalid or expired', 'INVALID_VERIFICATION_TOKEN');
        if (user.email_verified) return;
        if (stored.revoked_at || stored.expires_at <= new Date().toISOString()) throw new AppError(400, 'Verification link is invalid or expired', 'INVALID_VERIFICATION_TOKEN');
        user.email_verified = true;
        stored.revoked_at = new Date().toISOString();
      });
      return;
    }
    const { data } = await db.from('email_verification_tokens').select('*').eq('token_hash', hashToken(token)).maybeSingle();
    if (!data) throw new AppError(400, 'Verification link is invalid or expired', 'INVALID_VERIFICATION_TOKEN');
    const { data: user } = await db.from('users').select('email_verified').eq('id', data.user_id).maybeSingle();
    if (user?.email_verified) return;
    if (data.used_at || data.expires_at <= new Date().toISOString()) throw new AppError(400, 'Verification link is invalid or expired', 'INVALID_VERIFICATION_TOKEN');
    await db.from('users').update({ email_verified: true }).eq('id', data.user_id);
    await db.from('email_verification_tokens').update({ used_at: new Date().toISOString() }).eq('id', data.id);
  },

  async resendVerification(emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    if (isLocalDevelopment) {
      const user = await localDb.read((state) => state.users.find((item) => item.email === email));
      if (!user || user.email_verified) return { emailSent: true, verificationUrl: undefined };
      return createVerification(user);
    }
    const { data } = await db.from('users').select('id,email,username,email_verified').eq('email', email).maybeSingle();
    if (!data || data.email_verified) return { emailSent: true, verificationUrl: undefined };
    return createVerification({ id: data.id, email: data.email, username: data.username });
  },
};
