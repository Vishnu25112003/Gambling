import { api } from './client';
import type {
  AppUser,
  Balance,
  GameManifest,
  HistoryPage,
  LeaderboardEntry,
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

  verify: (walletAddress: string, nonce: string, signature: string) =>
    api<{ token: string; isNewUser: boolean; user: AppUser }>('/auth/verify', {
      method: 'POST',
      body: { walletAddress, nonce, signature },
      auth: false,
    }),

  me: () => api<{ user: AppUser }>('/auth/me'),

  updateProfile: (displayName: string | null) =>
    api<{ user: { id: string; displayName: string | null } }>('/auth/me', {
      method: 'PATCH',
      body: { displayName },
    }),
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

// --- public ----------------------------------------------------------------

export const publicApi = {
  leaderboard: (limit = 20) =>
    api<{ entries: LeaderboardEntry[] }>(`/leaderboard?limit=${limit}`),
  games: () => api<{ games: GameManifest[] }>('/games', { auth: false }),
  health: () => api<{ ok: boolean; cluster: string }>('/health', { auth: false }),
};
