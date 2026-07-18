import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import { env, isLocalDevelopment } from '../config/env.js';
import { db } from '../database/supabase.js';
import { localDb, type LocalUser } from '../database/local.database.js';
import { AppError } from '../utils/errors.js';
import { mapUser } from '../utils/mappers.js';
import { createOpaqueToken, hashToken, signAccessToken } from './token.service.js';
import { localVerificationPath, passwordResetUrl, sendPasswordResetEmail, sendVerificationEmail } from './mail.service.js';

interface Credentials { email: string; password: string; totpCode?: string }
interface RegisterInput extends Credentials { username: string }
interface SessionMeta { userAgent?: string; ip?: string }

async function createSession(user: { id: string; email: string; username: string }, meta: SessionMeta = {}) {
  const refreshToken = createOpaqueToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000);
  if (isLocalDevelopment) {
    await localDb.mutate((state) => state.refreshTokens.push({
      id: crypto.randomUUID(), user_id: user.id, token_hash: hashToken(refreshToken), expires_at: expiresAt.toISOString(), revoked_at: null, created_at: new Date().toISOString(), user_agent: meta.userAgent?.slice(0, 500) ?? null, ip_address: meta.ip ?? null, last_used_at: new Date().toISOString(),
    }));
    return { accessToken: signAccessToken(user), refreshToken, expiresAt };
  }
  const { error } = await db.from('refresh_tokens').insert({
    user_id: user.id,
    token_hash: hashToken(refreshToken),
    expires_at: expiresAt.toISOString(),
    user_agent: meta.userAgent?.slice(0, 500) ?? null,
    ip_address: meta.ip ?? null,
    last_used_at: new Date().toISOString(),
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
  async register(input: RegisterInput, meta: SessionMeta = {}) {
    const email = input.email.trim().toLowerCase();
    const username = input.username.trim();
    if (isLocalDevelopment) {
      const existing = await localDb.read((state) => state.users.some((user) => user.email === email || user.username.toLowerCase() === username.toLowerCase()));
      if (existing) throw new AppError(409, 'Email or username is already in use', 'ACCOUNT_EXISTS');
      const createdAt = new Date().toISOString();
      const user: LocalUser = {
        id: crypto.randomUUID(), username, email, password_hash: await bcrypt.hash(input.password, env.BCRYPT_ROUNDS), avatar: null, bio: null, status: 'offline', last_seen: createdAt, email_verified: !env.REQUIRE_EMAIL_VERIFICATION, created_at: createdAt,
      };
      await localDb.mutate((state) => { state.users.push(user); });
      if (!env.REQUIRE_EMAIL_VERIFICATION) {
        const session = await createSession(user, meta);
        return { user: mapUser(user as unknown as Record<string, unknown>, true), requiresEmailVerification: false as const, ...session };
      }
      const verification = await createVerification(user);
      return { user: mapUser(user as unknown as Record<string, unknown>, true), requiresEmailVerification: true as const, ...verification };
    }
    const [{ data: existingEmail }, { data: existingUsername }] = await Promise.all([
      db.from('users').select('id').eq('email', email).maybeSingle(),
      db.from('users').select('id').eq('username', username).maybeSingle(),
    ]);
    if (existingEmail || existingUsername) throw new AppError(409, 'Email or username is already in use', 'ACCOUNT_EXISTS');

    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
    const { data, error } = await db.from('users').insert({
      email,
      username,
      password_hash: passwordHash,
      email_verified: !env.REQUIRE_EMAIL_VERIFICATION,
    }).select('*').single();
    if (error || !data) throw new AppError(500, 'Could not create account', 'ACCOUNT_CREATE_FAILED');

    if (!env.REQUIRE_EMAIL_VERIFICATION) {
      const session = await createSession({ id: data.id, email, username }, meta);
      return { user: mapUser(data, true), requiresEmailVerification: false as const, ...session };
    }
    const verification = await createVerification({ id: data.id, email, username });
    return { user: mapUser(data, true), requiresEmailVerification: true as const, ...verification };
  },

  async login(input: Credentials, meta: SessionMeta = {}) {
    if (isLocalDevelopment) {
      const email = input.email.trim().toLowerCase();
      const user = await localDb.read((state) => state.users.find((item) => item.email === email));
      if (!user || !(await bcrypt.compare(input.password, user.password_hash))) throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
      if (env.REQUIRE_EMAIL_VERIFICATION && !user.email_verified) throw new AppError(403, 'Verify your email before signing in', 'EMAIL_NOT_VERIFIED');
      if (user.totp_enabled) {
        if (!input.totpCode) throw new AppError(401, 'Enter the six-digit authenticator code', 'TWO_FACTOR_REQUIRED');
        if (!(await verify({ secret: user.totp_secret!, token: input.totpCode })).valid) throw new AppError(401, 'Authenticator code is invalid', 'INVALID_TWO_FACTOR_CODE');
      }
      const session = await createSession(user, meta);
      return { user: mapUser(user as unknown as Record<string, unknown>, true), ...session };
    }
    const { data, error } = await db.from('users').select('*').eq('email', input.email.trim().toLowerCase()).maybeSingle();
    if (error || !data || !(await bcrypt.compare(input.password, data.password_hash))) {
      throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }
    if (env.REQUIRE_EMAIL_VERIFICATION && !data.email_verified) throw new AppError(403, 'Verify your email before signing in', 'EMAIL_NOT_VERIFIED');
    if (data.totp_enabled) {
      if (!input.totpCode) throw new AppError(401, 'Enter the six-digit authenticator code', 'TWO_FACTOR_REQUIRED');
      if (!(await verify({ secret: data.totp_secret, token: input.totpCode })).valid) throw new AppError(401, 'Authenticator code is invalid', 'INVALID_TWO_FACTOR_CODE');
    }
    const session = await createSession({ id: data.id, email: data.email, username: data.username }, meta);
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
      if (env.REQUIRE_EMAIL_VERIFICATION && !user.email_verified) throw new AppError(403, 'Verify your email before signing in', 'EMAIL_NOT_VERIFIED');
      const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000);
      await localDb.mutate((state) => {
        const stored = state.refreshTokens.find((item) => item.id === token.id);
        if (stored) {
          stored.expires_at = expiresAt.toISOString();
          stored.revoked_at = null;
          stored.last_used_at = now;
        }
      });
      return { accessToken: signAccessToken(user), refreshToken, expiresAt };
    }
    const now = new Date().toISOString();
    const { data } = await db.from('refresh_tokens').select('*, users(id,email,username,email_verified)').eq('token_hash', hashToken(refreshToken)).or(`revoked_at.is.null,revoked_at.gt.${now}`).gt('expires_at', now).maybeSingle();
    if (!data?.users) throw new AppError(401, 'Refresh token is invalid or expired', 'INVALID_REFRESH_TOKEN');
    const storedUser = data.users as unknown as { id: string; email: string; username: string; email_verified: boolean };
    if (env.REQUIRE_EMAIL_VERIFICATION && !storedUser.email_verified) throw new AppError(403, 'Verify your email before signing in', 'EMAIL_NOT_VERIFIED');
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000);
    const { error } = await db.from('refresh_tokens').update({ expires_at: expiresAt.toISOString(), revoked_at: null, last_used_at: now }).eq('id', data.id);
    if (error) throw new AppError(503, 'Could not renew session', 'SESSION_RENEW_FAILED');
    return { accessToken: signAccessToken(storedUser), refreshToken, expiresAt };
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
    if (!env.REQUIRE_EMAIL_VERIFICATION) return { emailSent: true, verificationUrl: undefined };
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

  async sessions(userId: string) {
    const rows = isLocalDevelopment
      ? await localDb.read((state) => state.refreshTokens.filter((item) => item.user_id === userId && !item.revoked_at))
      : ((await db.from('refresh_tokens').select('id,user_agent,ip_address,last_used_at,created_at,expires_at').eq('user_id', userId).is('revoked_at', null).order('last_used_at', { ascending: false })).data ?? []);
    return rows.map((item) => ({ id: item.id, userAgent: item.user_agent ?? null, ipAddress: item.ip_address ?? null, lastUsedAt: item.last_used_at ?? item.created_at, createdAt: item.created_at, expiresAt: item.expires_at }));
  },

  async revokeSession(userId: string, sessionId: string) {
    if (isLocalDevelopment) return localDb.mutate((state) => {
      const token = state.refreshTokens.find((item) => item.id === sessionId && item.user_id === userId);
      if (!token) throw new AppError(404, 'Session not found', 'SESSION_NOT_FOUND');
      token.revoked_at = new Date().toISOString();
    });
    const { error, count } = await db.from('refresh_tokens').update({ revoked_at: new Date().toISOString() }, { count: 'exact' }).eq('id', sessionId).eq('user_id', userId);
    if (error || !count) throw new AppError(404, 'Session not found', 'SESSION_NOT_FOUND');
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
    if (isLocalDevelopment) return localDb.mutate(async (state) => {
      const user = state.users.find((item) => item.id === userId);
      if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) throw new AppError(401, 'Current password is incorrect', 'INVALID_CURRENT_PASSWORD');
      user.password_hash = passwordHash;
    });
    const { data: user } = await db.from('users').select('password_hash').eq('id', userId).single();
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) throw new AppError(401, 'Current password is incorrect', 'INVALID_CURRENT_PASSWORD');
    const { error } = await db.from('users').update({ password_hash: passwordHash }).eq('id', userId);
    if (error) throw new AppError(500, 'Could not change password', 'PASSWORD_CHANGE_FAILED');
  },

  async setupTotp(userId: string) {
    const secret = generateSecret();
    const email = isLocalDevelopment
      ? await localDb.mutate((state) => {
        const user = state.users.find((item) => item.id === userId)!;
        user.totp_secret = secret;
        user.totp_enabled = false;
        return user.email;
      })
      : (await db.from('users').update({ totp_secret: secret, totp_enabled: false }).eq('id', userId).select('email').single()).data?.email;
    if (!email) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    return { secret, uri: generateURI({ issuer: 'NOVA Connect', label: email, secret }) };
  },

  async enableTotp(userId: string, code: string) {
    const secret = isLocalDevelopment
      ? await localDb.read((state) => state.users.find((item) => item.id === userId)?.totp_secret)
      : (await db.from('users').select('totp_secret').eq('id', userId).single()).data?.totp_secret;
    if (!secret || !(await verify({ secret, token: code })).valid) throw new AppError(422, 'Authenticator code is invalid', 'INVALID_TWO_FACTOR_CODE');
    if (isLocalDevelopment) await localDb.mutate((state) => { state.users.find((item) => item.id === userId)!.totp_enabled = true; });
    else await db.from('users').update({ totp_enabled: true }).eq('id', userId);
  },

  async disableTotp(userId: string, code: string) {
    const secret = isLocalDevelopment
      ? await localDb.read((state) => state.users.find((item) => item.id === userId)?.totp_secret)
      : (await db.from('users').select('totp_secret').eq('id', userId).single()).data?.totp_secret;
    if (!secret || !(await verify({ secret, token: code })).valid) throw new AppError(422, 'Authenticator code is invalid', 'INVALID_TWO_FACTOR_CODE');
    if (isLocalDevelopment) await localDb.mutate((state) => { const user = state.users.find((item) => item.id === userId)!; user.totp_enabled = false; user.totp_secret = null; });
    else await db.from('users').update({ totp_enabled: false, totp_secret: null }).eq('id', userId);
  },

  async requestPasswordReset(rawEmail: string) {
    const email = rawEmail.trim().toLowerCase();
    const user = isLocalDevelopment
      ? await localDb.read((state) => state.users.find((item) => item.email === email))
      : (await db.from('users').select('id,email,username').eq('email', email).maybeSingle()).data;
    if (!user) return {};
    const token = createOpaqueToken();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    if (isLocalDevelopment) {
      await localDb.mutate((state) => {
        state.passwordResetTokens.forEach((item) => { if (item.user_id === user.id && !item.revoked_at) item.revoked_at = now; });
        state.passwordResetTokens.push({ id: crypto.randomUUID(), user_id: user.id, token_hash: hashToken(token), expires_at: expiresAt, revoked_at: null, created_at: now });
      });
    } else {
      await db.from('password_reset_tokens').update({ used_at: now }).eq('user_id', user.id).is('used_at', null);
      const { error } = await db.from('password_reset_tokens').insert({ user_id: user.id, token_hash: hashToken(token), expires_at: expiresAt });
      if (error) throw new AppError(500, 'Could not create password reset link', 'PASSWORD_RESET_CREATE_FAILED');
    }
    try {
      const sent = await sendPasswordResetEmail(user.email, user.username, token);
      return { sent, ...(isLocalDevelopment ? { resetUrl: passwordResetUrl(token).replace(env.CLIENT_URL.split(',')[0]!.trim(), '') } : {}) };
    } catch (error) {
      console.error('Could not send password reset email', error);
      return {};
    }
  },

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = hashToken(token);
    const now = new Date().toISOString();
    if (isLocalDevelopment) {
      const reset = await localDb.read((state) => state.passwordResetTokens.find((item) => item.token_hash === tokenHash && !item.revoked_at && item.expires_at > now));
      if (!reset) throw new AppError(400, 'Password reset link is invalid or expired', 'INVALID_PASSWORD_RESET');
      await localDb.mutate(async (state) => {
        const user = state.users.find((item) => item.id === reset.user_id);
        if (!user) throw new AppError(400, 'Password reset link is invalid or expired', 'INVALID_PASSWORD_RESET');
        user.password_hash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
        state.passwordResetTokens.forEach((item) => { if (item.user_id === user.id && !item.revoked_at) item.revoked_at = now; });
        state.refreshTokens.forEach((item) => { if (item.user_id === user.id && !item.revoked_at) item.revoked_at = now; });
      });
      return;
    }
    const { data: reset } = await db.from('password_reset_tokens').select('id,user_id').eq('token_hash', tokenHash).is('used_at', null).gt('expires_at', now).maybeSingle();
    if (!reset) throw new AppError(400, 'Password reset link is invalid or expired', 'INVALID_PASSWORD_RESET');
    const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
    const { error } = await db.from('users').update({ password_hash: passwordHash }).eq('id', reset.user_id);
    if (error) throw new AppError(500, 'Could not reset password', 'PASSWORD_RESET_FAILED');
    await Promise.all([
      db.from('password_reset_tokens').update({ used_at: now }).eq('user_id', reset.user_id).is('used_at', null),
      db.from('refresh_tokens').update({ revoked_at: now }).eq('user_id', reset.user_id).is('revoked_at', null),
    ]);
  },
};
