/** Doc 11 — user profiles: identity, tier badges, statistics and match history. */
export { TIERS, tierFor, tierProgress } from './tiers.js';
export { RESERVED_USERNAMES, USERNAME_MAX, USERNAME_MIN, isReservedUsername, isUsernameAvailable, isValidUsername, normaliseUsername, parseUsername, } from './username.js';
export { dailyNet, lifetimeStats, perGameStats } from './stats.js';
export { HISTORY_DEFAULT_LIMIT, HISTORY_MAX_LIMIT, matchHistory } from './history.js';
export { AVATAR_DIR, AVATAR_FIELD, AVATAR_SIZE, MAX_AVATAR_BYTES, UPLOAD_ROOT, UPLOAD_URL_PREFIX, avatarUpload, ensureAvatarDir, removeAvatar, saveAvatar, } from './avatarStore.js';
export { profileRouter } from './profile.routes.js';
//# sourceMappingURL=index.js.map