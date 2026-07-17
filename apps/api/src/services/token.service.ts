import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface TokenUser {
  id: string;
  email: string;
  username: string;
}

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
export const createOpaqueToken = () => crypto.randomBytes(48).toString('base64url');

export const signAccessToken = (user: TokenUser) => jwt.sign(
  { email: user.email, username: user.username },
  env.JWT_ACCESS_SECRET,
  { subject: user.id, expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'], issuer: 'nova-connect' },
);

export const verifyAccessToken = (token: string): TokenUser => {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'nova-connect' });
  if (typeof payload === 'string' || !payload.sub || !payload.email || !payload.username) {
    throw new Error('Invalid access token');
  }
  return { id: payload.sub, email: String(payload.email), username: String(payload.username) };
};
