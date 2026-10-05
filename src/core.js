import { writeFileSync, renameSync, mkdirSync, statSync, chmodSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Generates a unique temporary path adjacent to the destination.
 *
 * The temp file is kept in the same directory so the rename is guaranteed to be
 * an atomic operation on the same filesystem. Using crypto.randomBytes avoids
 * collisions under concurrent writes without needing to track a counter.
 */
function tempPathFor(destPath) {
  const dir = dirname(destPath);
  const rand = randomBytes(8).toString('hex');
  return join(dir, `.${rand}.tmp`);
}

/**
 * Synchronously writes data to a temporary file then renames it into place.
 *
 * The classic partial-write problem: if a process writes directly to the
 * target file and crashes mid-write, any reader sees truncated or garbled
 * content. By writing to a sibling temp file and renaming — which POSIX
 * guarantees is atomic within a single directory — readers always see either
 * the old file or the complete new file, never an intermediate state.
 *
 * This is the synchronous variant because correctness under crash is the
 * entire point: an async version introduces windows where the temp file is
 * on disk but not renamed, which a separate crash path would have to clean
 * up. Keep it simple, keep it synchronous.
 *
 * Options:
 *   - encoding:   BufferEncoding for string data (default 'utf8').
 *   - mode:       file mode for the temp file (default preserves existing
 *                 file mode if the destination exists, else 0o666).
 *
 * Mode preservation is handled explicitly because atomic writes that reset
 * permissions to a default would be a surprising side-effect for callers
 * who have set restrictive modes on config files.
 */
export function atomicWrite(destPath, data, options = {}) {
  const { encoding = 'utf8', mode } = options;

  let resolvedMode;
  if (mode !== undefined) {
    resolvedMode = mode;
  } else {
    resolvedMode = preserveMode(destPath);
  }

  const tmpPath = tempPathFor(destPath);

  try {
    ensureDir(dirname(destPath));
    writeFileSync(tmpPath, data, { encoding, mode: resolvedMode });
    renameSync(tmpPath, destPath);
  } catch (err) {
    cleanupQuiet(tmpPath);
    throw err;
  }
}

/**
 * Convenience wrapper for string content.
 */
export function atomicWriteString(destPath, str, options) {
  atomicWrite(destPath, str, options);
}

/**
 * Convenience wrapper that JSON-serializes the given value.
 *
 * Uses two spaces for indentation, matching JSON.stringify's default
 * formatting. If you need custom formatting, call JSON.stringify yourself
 * and pass the string to atomicWrite.
 */
export function atomicWriteJson(destPath, value, options) {
  const json = JSON.stringify(value, null, 2);
  atomicWrite(destPath, json, options);
}

/**
 * Returns the mode of an existing file, or the default 0o666 if it does
 * not exist. Stays quiet on any stat error — if we cannot read metadata,
 * falling back to a default mode is the safe choice.
 */
function preserveMode(destPath) {
  try {
    const stats = statSync(destPath);
    return stats.mode & 0o777;
  } catch {
    return 0o666;
  }
}

/**
 * Creates the directory if it does not exist. mkdirSync with recursive is
 * idempotent, so this is safe to call on every write.
 */
function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

/**
 * Removes a temp file if it exists, swallowing errors. Called during error
 * cleanup so that a failed write does not leave orphaned temp files behind.
 */
function cleanupQuiet(tmpPath) {
  try {
    unlinkSync(tmpPath);
  } catch {
    // Nothing to do — file may not have been created, or already removed.
  }
}
