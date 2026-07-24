import type { OAuth2Client as OAuth2ClientType } from 'google-auth-library';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export interface GoogleIdentity {
  subject: string;
  email: string;
  emailVerified: true;
  name?: string;
  picture?: string;
  hostedDomain?: string;
}

let client: OAuth2ClientType | null = null;

export async function verifyGoogleCredential(credential: string): Promise<GoogleIdentity> {
  if (!env.GOOGLE_AUTH_ENABLED || !env.GOOGLE_AUTH_CLIENT_ID) {
    throw new AppError(503, 'Google sign-in is not configured', 'GOOGLE_AUTH_DISABLED');
  }

  if (!client) {
    const { OAuth2Client } = await import('google-auth-library');
    client = new OAuth2Client(env.GOOGLE_AUTH_CLIENT_ID);
  }
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: env.GOOGLE_AUTH_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new AppError(401, 'Google account email could not be verified', 'INVALID_GOOGLE_CREDENTIAL');
    }
    return {
      subject: payload.sub,
      email: payload.email.trim().toLowerCase(),
      emailVerified: true,
      ...(payload.name ? { name: payload.name } : {}),
      ...(payload.picture ? { picture: payload.picture } : {}),
      ...(payload.hd ? { hostedDomain: payload.hd } : {}),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(401, 'Google credential is invalid or expired', 'INVALID_GOOGLE_CREDENTIAL');
  }
}
