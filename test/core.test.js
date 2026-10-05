import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync, statSync, writeFileSync, chmodSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWrite, atomicWriteJson, atomicWriteString } from '../src/index.js';

describe('atomicWrite', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'atomic-write-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes data to the destination', () => {
    const dest = join(dir, 'out.txt');
    atomicWrite(dest, 'hello');
    assert.equal(readFileSync(dest, 'utf8'), 'hello');
  });

  it('overwrites existing content completely', () => {
    const dest = join(dir, 'out.txt');
    writeFileSync(dest, 'old content that is longer than new');
    atomicWrite(dest, 'new');
    assert.equal(readFileSync(dest, 'utf8'), 'new');
  });

  it('writes binary buffers', () => {
    const dest = join(dir, 'out.bin');
    const buf = Buffer.from([0x00, 0x01, 0xff, 0xfe]);
    atomicWrite(dest, buf);
    assert.deepEqual(readFileSync(dest), buf);
  });

  it('respects a custom encoding for string data', () => {
    const dest = join(dir, 'out.txt');
    atomicWrite(dest, 'héllo', { encoding: 'latin1' });
    const read = readFileSync(dest);
    // Under latin1, 'é' is a single byte 0xe9
    assert.deepEqual(Array.from(read), [0x68, 0xe9, 0x6c, 0x6c, 0x6f]);
  });

  it('creates parent directories if they do not exist', () => {
    const dest = join(dir, 'sub', 'deep', 'out.txt');
    atomicWrite(dest, 'nested');
    assert.equal(readFileSync(dest, 'utf8'), 'nested');
  });

  it('preserves the existing file mode by default', () => {
    const dest = join(dir, 'out.txt');
    writeFileSync(dest, 'initial');
    chmodSync(dest, 0o600);
    atomicWrite(dest, 'updated');
    const mode = statSync(dest).mode & 0o777;
    assert.equal(mode, 0o600);
  });

  it('uses the specified mode when explicitly provided', () => {
    const dest = join(dir, 'out.txt');
    atomicWrite(dest, 'data', { mode: 0o644 });
    const mode = statSync(dest).mode & 0o777;
    assert.equal(mode, 0o644);
  });

  it('does not leave temp files behind on success', () => {
    const dest = join(dir, 'out.txt');
    atomicWrite(dest, 'content');
    const entries = readdirSyncSafe(dir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0], 'out.txt');
  });

  it('does not leave temp files behind when rename fails', () => {
    // Pointing the destination at a path whose parent is a file makes
    // rename fail, exercising the cleanup path.
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, 'x');
    const dest = join(blocker, 'child.txt');

    assert.throws(() => atomicWrite(dest, 'content'), Error);

    // The blocker file should still be the only entry (no temp file leaked).
    const entries = readdirSyncSafe(dir);
    assert.deepEqual(entries.sort(), ['blocker']);
  });
});

describe('atomicWriteString', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'atomic-write-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes a string to the destination', () => {
    const dest = join(dir, 'str.txt');
    atomicWriteString(dest, 'plain string');
    assert.equal(readFileSync(dest, 'utf8'), 'plain string');
  });
});

describe('atomicWriteJson', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'atomic-write-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes JSON with two-space indentation', () => {
    const dest = join(dir, 'data.json');
    atomicWriteJson(dest, { a: 1, b: [2, 3] });
    const content = readFileSync(dest, 'utf8');
    assert.equal(content, JSON.stringify({ a: 1, b: [2, 3] }, null, 2));
  });

  it('can be read back as valid JSON', () => {
    const dest = join(dir, 'data.json');
    const obj = { nested: { value: true }, list: ['x', 'y'] };
    atomicWriteJson(dest, obj);
    assert.deepEqual(JSON.parse(readFileSync(dest, 'utf8')), obj);
  });
});

function readdirSyncSafe(dir) {
  return readdirSync(dir);
}
