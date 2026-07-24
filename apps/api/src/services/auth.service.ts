import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import { env, isLocalDevelopment } from '../config/env.js';
import { db } from '../database/supabase.js';
import { localDb, type LocalUser } from '../database/local.database.js';
import { AppError } from '../utils/errors.js';
import { mapUser } from '../utils/mappers.js';
import { createOpaqueToken, hashToken, signAccessToken } from './token.service.js';
import { MailDeliveryError, passwordResetUrl, sendPasswordResetEmail, sendVerificationEmail, type MailDeliveryErrorCode } from './mail.service.js';
import { accountModerationService } from './account-moderation.service.js';
import { verifyGoogleCredential } from './google-identity.service.js';

interface Credentials { email: string; password: string; totpCode?: string }
interface RegisterInput extends Credentials { username: string }
interface GoogleCredentials { credential: string; totpCode?: string }
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

function createVerificationCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function hashVerificationCode(userId: string, code: string) {
  return crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(`${userId}:${code}`).digest('hex');
}

async function createVerification(user: { id: string; email: string; username: string }) {
  const existingRows = isLocalDevelopment
    ? await localDb.read((state) => state.verificationTokens.filter((item) => item.user_id === user.id).map((item) => ({ id: item.id, token_hash: item.token_hash })))
    : ((await db.from('email_verification_tokens').select('id,token_hash').eq('user_id', user.id).order('created_at', { ascending: false })).data ?? []);
  const previousHashes = existingRows.map((item) => item.token_hash);
  let code = createVerificationCode();
  let tokenHash = hashVerificationCode(user.id, code);
  while (previousHashes.includes(tokenHash)) {
    code = createVerificationCode();
    tokenHash = hashVerificationCode(user.id, code);
  }
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  if (isLocalDevelopment) {
    await localDb.mutate((state) => {
      state.verificationTokens = state.verificationTokens.filter((stored) => stored.user_id !== user.id);
      state.verificationTokens.push({
        id: crypto.randomUUID(),
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
        revoked_at: null,
        created_at: new Date().toISOString(),
      });
    });
  } else {
    const primary = existingRows[0];
    const { error } = primary
      ? await db.from('email_verification_tokens').update({
        token_hash: tokenHash,
        expires_at: expiresAt,
        used_at: null,
        created_at: new Date().toISOString(),
      }).eq('id', primary.id)
      : await db.from('email_verification_tokens').insert({
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });
    if (error) throw new AppError(500, 'Could not create verification code', 'VERIFICATION_CREATE_FAILED');
    const obsoleteIds = existingRows.slice(1).map((item) => item.id);
    if (obsoleteIds.length) {
      const { error: cleanupError } = await db.from('email_verification_tokens').delete().in('id', obsoleteIds);
      if (cleanupError) console.error('Could not remove obsolete verification codes', cleanupError);
    }
  }
  let emailSent = false;
  let emailErrorCode: MailDeliveryErrorCode | undefined;
  try {
    emailSent = await sendVerificationEmail(user.email, user.username, code);
  } catch (error) {
    emailSent = false;
    emailErrorCode = error instanceof MailDeliveryError ? error.code : 'EMAIL_PROVIDER_UNAVAILABLE';
    console.error('Could not send verification email', error);
  }
  return {
    emailSent,
    emailErrorCode,
    verificationCode: isLocalDevelopment ? code : undefined,
  };
}

async function removePendingUser(userId: string) {
  if (isLocalDevelopment) {
    await localDb.mutate((state) => {
      state.users = state.users.filter((item) => item.id !== userId || item.email_verified);
      state.verificationTokens = state.verificationTokens.filter((item) => item.user_id !== userId);
    });
    return;
  }
  const { error } = await db.from('users').delete().eq('id', userId).eq('email_verified', false);
  if (error) console.error('Could not clean up pending registration', error);
}

function deliveryError(code: MailDeliveryErrorCode | undefined) {
  const messages: Record<MailDeliveryErrorCode, string> = {
    EMAIL_PROVIDER_AUTH_FAILED: 'بيانات اعتماد مزود البريد غير صالحة أو انتهت صلاحيتها.',
    EMAIL_SENDER_REJECTED: 'عنوان المرسل غير معتمد لدى مزود البريد. تحقق من إعدادات المرسل.',
    EMAIL_PROVIDER_LIMIT: 'تم بلوغ حد إرسال البريد مؤقتًا. حاول مرة أخرى بعد قليل.',
    EMAIL_PROVIDER_UNAVAILABLE: 'خدمة إرسال البريد غير متاحة الآن. حاول مرة أخرى بعد قليل.',
    EMAIL_DELIVERY_REJECTED: 'رفض مزود البريد إرسال الرمز. تحقق من إعدادات الحساب والمرسل.',
  };
  const safeCode = code ?? 'EMAIL_PROVIDER_UNAVAILABLE';
  return new AppError(503, messages[safeCode], safeCode);
}

async function requireDeliveredVerification(
  user: { id: string },
  verification: Awaited<ReturnType<typeof createVerification>>,
) {
  if (verification.emailSent || verification.verificationCode) return verification;
  await removePendingUser(user.id);
  throw deliveryError(verification.emailErrorCode);
}

function googleUsernameBase(name: string | undefined, email: string) {
  const source = (name?.trim() || email.split('@')[0] || 'nova_user')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  const base = source.length >= 3 ? source : 'nova_user';
  return base.slice(0, 24);
}

function googleUsernameCandidate(base: string, subject: string, attempt: number) {
  const stableSuffix = subject.replace(/[^A-Za-z0-9]/g, '').slice(-6) || 'google';
  const suffix = attempt === 0 ? stableSuffix : `${stableSuffix}${attempt}`;
  return `${base.slice(0, 31 - suffix.length)}_${suffix}`;
}

async function availableGoogleUsername(name: string | undefined, email: string, subject: string) {
  const base = googleUsernameBase(name, email);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = googleUsernameCandidate(base, subject, attempt);
    const exists = isLocalDevelopment
      ? await localDb.read((state) => state.users.some((user) => user.username.toLowerCase() === candidate.toLowerCase()))
      : Boolean((await db.from('users').select('id').ilike('username', candidate).limit(1)).data?.length);
    if (!exists) return candidate;
  }
  throw new AppError(409, 'Could not reserve a username for this Google account', 'USERNAME_UNAVAILABLE');
}

async function assertTotpIfEnabled(
  user: { totp_enabled?: boolean; totp_secret?: string | null },
  totpCode?: string,
) {
  if (!user.totp_enabled) return;
  if (!totpCode) throw new AppError(401, 'Enter the six-digit authenticator code', 'TWO_FACTOR_REQUIRED');
  if (!user.totp_secret || !(await verify({ secret: user.totp_secret, token: totpCode })).valid) {
    throw new AppError(401, 'Authenticator code is invalid', 'INVALID_TWO_FACTOR_CODE');
  }
}

export const authService = {
  async register(input: RegisterInput, meta: SessionMeta = {}) {
    const email = input.email.trim().toLowerCase();
    const username = input.username.trim();
    if (isLocalDevelopment) {
      const { existingEmail, existingUsername } = await localDb.read((state) => ({
        existingEmail: state.users.find((user) => user.email === email),
        existingUsername: state.users.find((user) => user.username.toLowerCase() === username.toLowerCase()),
      }));
      if (existingEmail?.email_verified || (existingUsername && existingUsername.id !== existingEmail?.id)) {
        throw new AppError(409, 'Email or username is already in use', 'ACCOUNT_EXISTS');
      }
      const createdAt = new Date().toISOString();
      const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
      const user: LocalUser = existingEmail ?? {
        id: crypto.randomUUID(), username, email, password_hash: passwordHash, avatar: null, bio: null, status: 'offline', last_seen: createdAt, email_verified: !env.REQUIRE_EMAIL_VERIFICATION, created_at: createdAt,
      };
      user.username = username;
      user.password_hash = passwordHash;
      user.created_at = createdAt;
      await localDb.mutate((state) => {
        const stored = state.users.find((item) => item.id === user.id);
        if (stored) Object.assign(stored, user);
        else state.users.push(user);
      });
      if (!env.REQUIRE_EMAIL_VERIFICATION) {
        const session = await createSession(user, meta);
        return { user: mapUser(user as unknown as Record<string, unknown>, true), requiresEmailVerification: false as const, ...session };
      }
      const verification = await requireDeliveredVerification(user, await createVerification(user));
      return { user: mapUser(user as unknown as Record<string, unknown>, true), requiresEmailVerification: true as const, ...verification };
    }
    const [{ data: existingEmail }, { data: usernameCandidates }] = await Promise.all([
      db.from('users').select('*').eq('email', email).maybeSingle(),
      db.from('users').select('id,username').ilike('username', username).limit(10),
    ]);
    const existingUsername = (usernameCandidates ?? []).find((candidate) => candidate.username.toLowerCase() === username.toLowerCase());
    if (existingEmail?.email_verified || (existingUsername && existingUsername.id !== existingEmail?.id)) {
      throw new AppError(409, 'Email or username is already in use', 'ACCOUNT_EXISTS');
    }

    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
    const { data, error } = existingEmail
      ? await db.from('users').update({
        username,
        password_hash: passwordHash,
        email_verified: !env.REQUIRE_EMAIL_VERIFICATION,
        created_at: new Date().toISOString(),
      }).eq('id', existingEmail.id).eq('email_verified', false).select('*').single()
      : await db.from('users').insert({
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
    const verification = await requireDeliveredVerification(data, await createVerification({ id: data.id, email, username }));
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
      await accountModerationService.assertCanAuthenticate(user.id);
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
    await accountModerationService.assertCanAuthenticate(data.id);
    const session = await createSession({ id: data.id, email: data.email, username: data.username }, meta);
    return { user: mapUser(data, true), ...session };
  },

  async google(input: GoogleCredentials, meta: SessionMeta = {}) {
    const identity = await verifyGoogleCredential(input.credential);
    const googleCanAuthorizeEmail = identity.email.endsWith('@gmail.com') || Boolean(identity.hostedDomain);
    let created = false;

    if (isLocalDevelopment) {
      let user = await localDb.read((state) => state.users.find((item) => item.google_subject === identity.subject));
      if (!user) {
        const existingEmail = await localDb.read((state) => state.users.find((item) => item.email === identity.email));
        if (existingEmail) {
          if (existingEmail.google_subject && existingEmail.google_subject !== identity.subject) {
            throw new AppError(409, 'This email is linked to another Google account', 'GOOGLE_ACCOUNT_CONFLICT');
          }
          if (existingEmail.email_verified && !googleCanAuthorizeEmail) {
            throw new AppError(409, 'Sign in with your password before linking this Google account', 'ACCOUNT_LINK_REQUIRED');
          }
          await localDb.mutate((state) => {
            const stored = state.users.find((item) => item.id === existingEmail.id)!;
            stored.google_subject = identity.subject;
            stored.email_verified = true;
            if (!stored.avatar && identity.picture) stored.avatar = identity.picture;
          });
          user = existingEmail;
          user.google_subject = identity.subject;
          user.email_verified = true;
          if (!user.avatar && identity.picture) user.avatar = identity.picture;
        } else {
          const username = await availableGoogleUsername(identity.name, identity.email, identity.subject);
          const createdAt = new Date().toISOString();
          const passwordHash = await bcrypt.hash(crypto.randomBytes(64).toString('hex'), env.BCRYPT_ROUNDS);
          user = {
            id: crypto.randomUUID(),
            username,
            email: identity.email,
            password_hash: passwordHash,
            avatar: identity.picture ?? null,
            bio: null,
            status: 'offline',
            last_seen: createdAt,
            email_verified: true,
            google_subject: identity.subject,
            created_at: createdAt,
          };
          await localDb.mutate((state) => state.users.push(user!));
          created = true;
        }
      }
      await assertTotpIfEnabled(user, input.totpCode);
      await accountModerationService.assertCanAuthenticate(user.id);
      const session = await createSession(user, meta);
      return { user: mapUser(user as unknown as Record<string, unknown>, true), created, ...session };
    }

    const googleLookup = await db.from('users').select('*').eq('google_subject', identity.subject).maybeSingle();
    let user = googleLookup.data;
    if (googleLookup.error) throw new AppError(500, 'Could not authenticate Google account', 'GOOGLE_AUTH_FAILED');
    if (!user) {
      const existingResult = await db.from('users').select('*').eq('email', identity.email).maybeSingle();
      if (existingResult.error) throw new AppError(500, 'Could not authenticate Google account', 'GOOGLE_AUTH_FAILED');
      const existingEmail = existingResult.data;
      if (existingEmail) {
        if (existingEmail.google_subject && existingEmail.google_subject !== identity.subject) {
          throw new AppError(409, 'This email is linked to another Google account', 'GOOGLE_ACCOUNT_CONFLICT');
        }
        if (existingEmail.email_verified && !googleCanAuthorizeEmail) {
          throw new AppError(409, 'Sign in with your password before linking this Google account', 'ACCOUNT_LINK_REQUIRED');
        }
        const updated = await db.from('users').update({
          google_subject: identity.subject,
          email_verified: true,
          ...(!existingEmail.avatar && identity.picture ? { avatar: identity.picture } : {}),
        }).eq('id', existingEmail.id).select('*').single();
        if (updated.error || !updated.data) throw new AppError(500, 'Could not link Google account', 'GOOGLE_LINK_FAILED');
        user = updated.data;
      } else {
        const username = await availableGoogleUsername(identity.name, identity.email, identity.subject);
        const passwordHash = await bcrypt.hash(crypto.randomBytes(64).toString('hex'), env.BCRYPT_ROUNDS);
        const inserted = await db.from('users').insert({
          email: identity.email,
          username,
          password_hash: passwordHash,
          email_verified: true,
          google_subject: identity.subject,
          avatar: identity.picture ?? null,
        }).select('*').single();
        if (inserted.error || !inserted.data) {
          if (inserted.error?.code === '23505') {
            throw new AppError(409, 'This Google account is already linked. Please try again.', 'GOOGLE_ACCOUNT_CONFLICT');
          }
          throw new AppError(500, 'Could not create Google account', 'ACCOUNT_CREATE_FAILED');
        }
        user = inserted.data;
        created = true;
      }
    }
    await assertTotpIfEnabled(user, input.totpCode);
    await accountModerationService.assertCanAuthenticate(user.id);
    const session = await createSession({ id: user.id, email: user.email, username: user.username }, meta);
    return { user: mapUser(user, true), created, ...session };
  },

  async refresh(refreshToken?: string) {
    if (!refreshToken) throw new AppError(401, 'Refresh token is missing', 'MISSING_REFRESH_TOKEN');
    if (isLocalDevelopment) {
      const tokenHash = hashToken(refreshToken);
      const now = new Date().toISOString();
      const token = await localDb.read((state) => state.refreshTokens.find((item) => item.token_hash === tokenHash && !item.revoked_at && item.expires_at > now));
      if (!token) throw new AppError(401, 'Refresh token is invalid or expired', 'INVALID_REFRESH_TOKEN');
      const user = await localDb.read((state) => state.users.find((item) => item.id === token.user_id));
      if (!user) throw new AppError(401, 'Refresh token is invalid or expired', 'INVALID_REFRESH_TOKEN');
      if (env.REQUIRE_EMAIL_VERIFICATION && !user.email_verified) throw new AppError(403, 'Verify your email before signing in', 'EMAIL_NOT_VERIFIED');
      await accountModerationService.assertCanAuthenticate(user.id);
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
    const { data } = await db.from('refresh_tokens').select('*, users(id,email,username,email_verified)').eq('token_hash', hashToken(refreshToken)).is('revoked_at', null).gt('expires_at', now).maybeSingle();
    if (!data?.users) throw new AppError(401, 'Refresh token is invalid or expired', 'INVALID_REFRESH_TOKEN');
    const storedUser = data.users as unknown as { id: string; email: string; username: string; email_verified: boolean };
    if (env.REQUIRE_EMAIL_VERIFICATION && !storedUser.email_verified) throw new AppError(403, 'Verify your email before signing in', 'EMAIL_NOT_VERIFIED');
    await accountModerationService.assertCanAuthenticate(storedUser.id);
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

  async verifyEmail(emailInput: string, code: string, meta: SessionMeta = {}) {
    const email = emailInput.trim().toLowerCase();
    const now = new Date().toISOString();
    if (isLocalDevelopment) {
      const user = await localDb.mutate((state) => {
        const candidate = state.users.find((item) => item.email === email);
        if (!candidate || candidate.email_verified) throw new AppError(400, 'Verification code is invalid or expired', 'INVALID_VERIFICATION_CODE');
        const tokenHash = hashVerificationCode(candidate.id, code);
        const stored = state.verificationTokens.find((item) => item.token_hash === tokenHash);
        if (!stored || stored.revoked_at || stored.expires_at <= now) throw new AppError(400, 'Verification code is invalid or expired', 'INVALID_VERIFICATION_CODE');
        const user = state.users.find((item) => item.id === stored.user_id);
        if (!user) throw new AppError(400, 'Verification code is invalid or expired', 'INVALID_VERIFICATION_CODE');
        user.email_verified = true;
        stored.revoked_at = now;
        return user;
      });
      return {
        user: mapUser(user as unknown as Record<string, unknown>, true),
        ...(await createSession(user, meta)),
      };
    }
    const { data: user } = await db.from('users').select('*').eq('email', email).maybeSingle();
    if (!user || user.email_verified) throw new AppError(400, 'Verification code is invalid or expired', 'INVALID_VERIFICATION_CODE');
    const tokenHash = hashVerificationCode(user.id, code);
    const { data } = await db.from('email_verification_tokens').select('id,user_id').eq('token_hash', tokenHash).is('used_at', null).gt('expires_at', now).maybeSingle();
    if (!data) throw new AppError(400, 'Verification code is invalid or expired', 'INVALID_VERIFICATION_CODE');
    const { data: consumed, error: consumeError } = await db.from('email_verification_tokens').update({ used_at: now }).eq('id', data.id).is('used_at', null).select('id').maybeSingle();
    if (consumeError || !consumed) throw new AppError(400, 'Verification code is invalid or expired', 'INVALID_VERIFICATION_CODE');
    const { error } = await db.from('users').update({ email_verified: true }).eq('id', user.id).eq('email_verified', false);
    if (error) {
      await db.from('email_verification_tokens').update({ used_at: null }).eq('id', data.id);
      throw new AppError(500, 'Could not verify email', 'EMAIL_VERIFICATION_FAILED');
    }
    return {
      user: mapUser(user, true),
      ...(await createSession(user, meta)),
    };
  },

  async resendVerification(emailInput: string) {
    if (!env.REQUIRE_EMAIL_VERIFICATION) return { emailSent: true, verificationCode: undefined };
    const email = emailInput.trim().toLowerCase();
    if (isLocalDevelopment) {
      const user = await localDb.read((state) => state.users.find((item) => item.email === email));
      if (!user || user.email_verified) return { emailSent: true, verificationCode: undefined };
      return requireDeliveredVerification(user, await createVerification(user));
    }
    const { data } = await db.from('users').select('id,email,username,email_verified').eq('email', email).maybeSingle();
    if (!data || data.email_verified) return { emailSent: true, verificationCode: undefined };
    return requireDeliveredVerification(data, await createVerification({ id: data.id, email: data.email, username: data.username }));
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

  async changePassword(userId: string, currentPassword: string, newPassword: string, currentRefreshToken?: string) {
    const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
    const currentTokenHash = currentRefreshToken ? hashToken(currentRefreshToken) : null;
    if (isLocalDevelopment) return localDb.mutate(async (state) => {
      const user = state.users.find((item) => item.id === userId);
      if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) throw new AppError(401, 'Current password is incorrect', 'INVALID_CURRENT_PASSWORD');
      user.password_hash = passwordHash;
      const now = new Date().toISOString();
      state.refreshTokens
        .filter((item) => item.user_id === userId && !item.revoked_at && item.token_hash !== currentTokenHash)
        .forEach((item) => { item.revoked_at = now; });
    });
    const { data: user } = await db.from('users').select('password_hash').eq('id', userId).single();
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) throw new AppError(401, 'Current password is incorrect', 'INVALID_CURRENT_PASSWORD');
    const { error } = await db.from('users').update({ password_hash: passwordHash }).eq('id', userId);
    if (error) throw new AppError(500, 'Could not change password', 'PASSWORD_CHANGE_FAILED');
    let revokeQuery = db.from('refresh_tokens').update({ revoked_at: new Date().toISOString() }).eq('user_id', userId).is('revoked_at', null);
    if (currentTokenHash) revokeQuery = revokeQuery.neq('token_hash', currentTokenHash);
    const { error: revokeError } = await revokeQuery;
    if (revokeError) throw new AppError(500, 'Password changed but other sessions could not be revoked', 'SESSION_REVOKE_FAILED');
  },

  async setupTotp(userId: string) {
    const existing = isLocalDevelopment
      ? await localDb.read((state) => state.users.find((item) => item.id === userId))
      : (await db.from('users').select('email,totp_enabled').eq('id', userId).maybeSingle()).data;
    if (!existing) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    if (existing.totp_enabled) throw new AppError(409, 'Disable two-factor authentication before setting up a new authenticator', 'TWO_FACTOR_ALREADY_ENABLED');
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
    const { data: candidate } = await db.from('password_reset_tokens').select('id,user_id').eq('token_hash', tokenHash).is('used_at', null).gt('expires_at', now).maybeSingle();
    if (!candidate) throw new AppError(400, 'Password reset link is invalid or expired', 'INVALID_PASSWORD_RESET');
    const { data: reset, error: consumeError } = await db.from('password_reset_tokens')
      .update({ used_at: now })
      .eq('id', candidate.id)
      .is('used_at', null)
      .select('id,user_id')
      .maybeSingle();
    if (consumeError || !reset) throw new AppError(400, 'Password reset link is invalid or expired', 'INVALID_PASSWORD_RESET');
    const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
    const { error } = await db.from('users').update({ password_hash: passwordHash }).eq('id', reset.user_id);
    if (error) {
      await db.from('password_reset_tokens').update({ used_at: null }).eq('id', reset.id);
      throw new AppError(500, 'Could not reset password', 'PASSWORD_RESET_FAILED');
    }
    await Promise.all([
      db.from('password_reset_tokens').update({ used_at: now }).eq('user_id', reset.user_id).is('used_at', null),
      db.from('refresh_tokens').update({ revoked_at: now }).eq('user_id', reset.user_id).is('revoked_at', null),
    ]);
  },
};
