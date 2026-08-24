import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { unauthorized } from '../lib/errors.js';
export function issueToken(userId, walletAddress) {
    const payload = { sub: userId, addr: walletAddress };
    return jwt.sign(payload, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN,
    });
}
export function verifyToken(token) {
    try {
        const decoded = jwt.verify(token, env.JWT_SECRET);
        if (!decoded?.sub)
            throw new Error('missing subject');
        return decoded;
    }
    catch {
        throw unauthorized('Session is invalid or has expired. Please connect your wallet again.');
    }
}
/** Pull a bearer token out of an Authorization header. */
export function extractBearer(header) {
    if (!header)
        return null;
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token)
        return null;
    return token;
}
//# sourceMappingURL=jwt.js.map