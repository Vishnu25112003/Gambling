import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { unauthorized } from '../lib/errors.js';

/**
 * Doc 01 rule: the JWT's primary claim is the INTERNAL user id, never the
 * wallet address. The address rides along only as a convenience claim so the
 * frontend can display it — nothing authorises off it.
 */
export interface TokenPayload {
  sub: string; // internal User._id
  addr: string; // wallet address, display only
}

export function issueToken(userId: string, walletAddress: string): string {
  const payload: TokenPayload = { sub: userId, addr: walletAddress };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as SignOptions);
}

export function verifyToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    if (!decoded?.sub) throw new Error('missing subject');
    return decoded;
  } catch {
    throw unauthorized('Session is invalid or has expired. Please connect your wallet again.');
  }
}

/** Pull a bearer token out of an Authorization header. */
export function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}
