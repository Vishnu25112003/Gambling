import type { User } from '../generated/prisma/client.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth / optionalAuth. Absent on public routes. */
      user?: User;
      userId?: string;
    }
  }
}

export {};
