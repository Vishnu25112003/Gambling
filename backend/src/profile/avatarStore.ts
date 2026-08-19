import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import sharp from 'sharp';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { badRequest } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('profile:avatar');

/**
 * Doc 11 — profile image upload.
 *
 * Files land on local disk and are served by `express.static`. On devnet that is
 * the right amount of infrastructure: no external account, no credentials, works
 * offline. Everything that touches a path or a byte lives in this file, so moving
 * to S3 later means rewriting `saveAvatar`/`removeAvatar` and nothing else — the
 * same reasoning that keeps the treasury behind one module in doc 02.
 */

/** 2 MB. Generous for a 256px avatar, small enough not to be a DoS surface. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
/** Stored square, so every call site can crop to a circle or a tile freely. */
export const AVATAR_SIZE = 256;

export const AVATAR_FIELD = 'avatar';

/**
 * Resolved from `import.meta.url`, NOT `process.cwd()`.
 *
 * `npm run dev` runs `tsx watch src/index.ts` and `npm start` runs
 * `node dist/index.js` — a cwd-relative path happens to work in both but silently
 * splits uploads across two directories the moment anything is launched from
 * elsewhere (a cron entry, a test, the repo root). `dist/` is one level deeper
 * than `src/`, so both resolve to the same `backend/uploads`.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_ROOT = path.resolve(HERE, '../../uploads');
export const AVATAR_DIR = path.join(UPLOAD_ROOT, 'avatars');

/** The URL prefix `app.ts` serves `UPLOAD_ROOT` from. */
export const UPLOAD_URL_PREFIX = '/uploads';

export async function ensureAvatarDir(): Promise<void> {
  await fs.mkdir(AVATAR_DIR, { recursive: true });
}

/**
 * Memory storage, deliberately — never `multer.diskStorage`.
 *
 * Disk storage writes the upload to a temp file BEFORE any of our validation
 * runs, which means an unvalidated payload of arbitrary bytes touches the
 * filesystem and has to be cleaned up on every rejection path. Holding at most
 * 2 MB in memory instead removes that entire class of problem.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1, fields: 4 },
});

/**
 * `upload.single`, with multer's errors translated into `AppError`s.
 *
 * Multer rejects an oversized file with a `MulterError`, which the app's error
 * handler does not recognise — so without this wrapper an over-2MB upload
 * surfaces as a 500 "Something went wrong" instead of telling the player the file
 * is too big.
 */
export const avatarUpload: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  upload.single(AVATAR_FIELD)(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(badRequest('That image is too large — the maximum is 2 MB.'));
        return;
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
        next(badRequest(`Send exactly one image, in a "${AVATAR_FIELD}" field.`));
        return;
      }
      next(badRequest(`Upload rejected: ${err.message}`));
      return;
    }
    next(err);
  });
};

/**
 * Sniff the real image type from the bytes.
 *
 * `file.mimetype` is copied from the request's own Content-Type header — it is
 * supplied by the caller and is therefore a claim, not evidence. A `.txt` renamed
 * to `.png` carries `image/png` quite happily. These are the actual signatures.
 */
function sniffImageType(buf: Buffer): 'png' | 'jpeg' | 'webp' | null {
  if (buf.length < 12) return null;

  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  // RIFF....WEBP — the 4 bytes between are the file size, so they are skipped.
  if (
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }

  return null;
}

/** `<userId>.webp` — derived only from the session, never from client input. */
export function avatarFilename(userId: string): string {
  return `${userId}.webp`;
}

/**
 * Validate, re-encode and write. Returns the root-relative URL to store.
 *
 * The filename comes from the authenticated `userId` alone, so there is no
 * path-traversal surface: no client-supplied string ever reaches a path. The name
 * is also STABLE, which means a replacement simply overwrites — there is no old
 * file to hunt down and delete.
 *
 * Because the path is stable, the URL carries a `?v=` counter. Without it a
 * replaced avatar keeps rendering from cache until a hard refresh, which reads as
 * "the upload silently failed".
 */
export async function saveAvatar(
  userId: string,
  buffer: Buffer,
  previousUrl: string | null,
): Promise<string> {
  const kind = sniffImageType(buffer);
  if (!kind) {
    throw badRequest('That file is not a PNG, JPEG or WebP image.');
  }

  let encoded: Buffer;
  try {
    encoded = await sharp(buffer)
      // `.rotate()` with no argument applies the EXIF orientation tag, so a phone
      // photo is not stored sideways. Re-encoding then drops all metadata, which
      // is how the GPS coordinates in that same EXIF block get stripped — a
      // profile picture must not publish where it was taken.
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (err) {
    // A valid signature on a truncated or malformed file still fails to decode.
    log.warn('avatar re-encode failed', { userId, reason: (err as Error).message });
    throw badRequest('That image could not be processed — try a different file.');
  }

  await ensureAvatarDir();
  await fs.writeFile(path.join(AVATAR_DIR, avatarFilename(userId)), encoded);

  const version = nextVersion(previousUrl);
  log.info('avatar saved', { userId, kind, bytes: encoded.length, version });

  return `${UPLOAD_URL_PREFIX}/avatars/${avatarFilename(userId)}?v=${version}`;
}

/** Delete the file. Returns quietly if it was never there. */
export async function removeAvatar(userId: string): Promise<void> {
  try {
    await fs.unlink(path.join(AVATAR_DIR, avatarFilename(userId)));
  } catch (err) {
    // ENOENT is the expected case for a player whose avatarUrl is already null,
    // or whose file was removed out of band. Anything else is worth knowing about
    // but must not fail the request — the database row is the source of truth for
    // whether an avatar exists.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.warn('avatar unlink failed', { userId, reason: (err as Error).message });
    }
  }
}

/** Read `?v=N` off the previous URL and step it. Starts at 1. */
function nextVersion(previousUrl: string | null): number {
  if (!previousUrl) return 1;
  const match = /[?&]v=(\d+)/.exec(previousUrl);
  const current = match ? Number.parseInt(match[1]!, 10) : 0;
  return Number.isFinite(current) ? current + 1 : 1;
}
