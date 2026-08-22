import { api } from './client';
import type {
  AppUser,
  Balance,
  GameManifest,
  HistoryPage,
  LeaderboardEntry,
  MatchHistoryPage,
  Profile,
  ReferralLookup,
  ReferralStats,
  UsernameCheck,
  WalletInfo,
  WithdrawResponse,
} from '../types';

// --- doc 01: auth ----------------------------------------------------------

export const authApi = {
  challenge: (walletAddress: string) =>
    api<{ nonce: string; message: string; expiresAt: string }>('/auth/challenge', {
      method: 'POST',
      body: { walletAddress },
      auth: false,
    }),

  /**
   * `referralCode` is the invite code captured from `?ref=` on the landing page.
   * The server applies it only if the caller is still eligible, and never fails
   * the sign-in over it — check `referralApplied` to know whether it stuck.
   */
  verify: (walletAddress: string, nonce: string, signature: string, referralCode?: string) =>
    api<{ token: string; isNewUser: boolean; referralApplied: boolean; user: AppUser }>(
      '/auth/verify',
      {
        method: 'POST',
        body: { walletAddress, nonce, signature, ...(referralCode ? { referralCode } : {}) },
        auth: false,
      },
    ),

  me: () => api<{ user: AppUser }>('/auth/me'),

  /** Doc 11 — the single identity field. `null` clears it. */
  updateProfile: (patch: { username: string | null }) =>
    api<{ user: { id: string; username: string | null } }>('/auth/me', {
      method: 'PATCH',
      body: patch,
    }),

  /** Doc 11 — multipart upload. `client.ts` omits the JSON Content-Type for FormData. */
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('avatar', file);
    return api<{ user: { id: string; avatarUrl: string | null } }>('/auth/me/avatar', {
      method: 'POST',
      body: form,
    });
  },

  removeAvatar: () =>
    api<{ user: { id: string; avatarUrl: string | null } }>('/auth/me/avatar', {
      method: 'DELETE',
    }),
};

// --- doc 11: user profiles -------------------------------------------------

export const profileApi = {
  /** Everything the own-profile page renders, in one call. */
  me: () => api<Profile>('/profile/me'),

  /**
   * Somebody else's profile. Public — `auth: false` so a signed-out visitor can
   * open a shared link, matching doc 06's ungated sections.
   */
  byHandle: (handle: string) =>
    api<Profile>(`/profile/${encodeURIComponent(handle)}`, { auth: false }),

  history: (handle: string | 'me', page = 1, limit = 20) =>
    api<MatchHistoryPage>(
      `/profile/${handle === 'me' ? 'me' : encodeURIComponent(handle)}/history?page=${page}&limit=${limit}`,
      { auth: handle === 'me' },
    ),

  /** Advisory only — the unique index decides, and PATCH returns 409 on a race. */
  checkUsername: (username: string) =>
    api<UsernameCheck>(`/profile/username/check?u=${encodeURIComponent(username)}`),
};

// --- doc 02: wallet --------------------------------------------------------

export const walletApi = {
  info: () => api<WalletInfo>('/wallet/info', { auth: false }),
  balance: () => api<Balance>('/wallet/balance'),

  /**
   * `amount` is sent as a STRING so the exact value the user typed reaches the
   * server. Routing it through a JS number first could round it.
   */
  withdraw: (amount: string) =>
    api<WithdrawResponse>('/wallet/withdraw', { method: 'POST', body: { amount } }),

  claimDeposit: (txSignature: string) =>
    api<{ credited: boolean; reason?: string }>('/wallet/deposits/claim', {
      method: 'POST',
      body: { txSignature },
    }),

  history: (page = 1, limit = 25) =>
    api<HistoryPage>(`/wallet/history?page=${page}&limit=${limit}`),
};

// --- doc 09: invite & earn -------------------------------------------------

export const referralApi = {
  /** Everything the Invite & Earn page renders, in one call. */
  me: () => api<ReferralStats>('/referrals/me'),

  /** The fallback for someone who signed up without clicking an invite link. */
  claim: (code: string) =>
    api<{ referredBy: { name: string }; commissionBps: number }>('/referrals/claim', {
      method: 'POST',
      body: { code },
    }),

  /** Public — confirms a `?ref=` link resolved, before the visitor has an identity. */
  lookup: (code: string) =>
    api<ReferralLookup>(`/referrals/code/${encodeURIComponent(code)}`, { auth: false }),
};

// --- public ----------------------------------------------------------------

export const publicApi = {
  leaderboard: (limit = 20) =>
    api<{ entries: LeaderboardEntry[] }>(`/leaderboard?limit=${limit}`),
  games: () => api<{ games: GameManifest[] }>('/games', { auth: false }),
  health: () => api<{ ok: boolean; cluster: string }>('/health', { auth: false }),
};
