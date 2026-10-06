# Atomic Write

Synchronously writes a file to a temporary sibling then renames it into place, so readers never see a partially written file.

```js
import { atomicWrite, atomicWriteJson, atomicWriteString } from 'atomic-write';

atomicWrite('/etc/app/config.json', '{"key":"value"}');
atomicWriteString('/etc/app/notes.txt', 'hello');
atomicWriteJson('/etc/app/state.json', { count: 42, items: ['a', 'b'] });
```

## Why

When a process writes directly to a file and crashes mid-write, any concurrent reader sees truncated or garbled content. On POSIX systems, renaming a file within the same directory is atomic — the path resolves to either the old inode or the new one, with no intermediate state visible. This library exploits that guarantee: it writes the full content to a temp file in the same directory as the destination, then renames it.

The trade-off is that this is synchronous. An async version would introduce a window where the temp file exists but has not been renamed; cleaning that up after a crash adds complexity that defeats the simplicity the library exists to provide. If you need non-blocking writes, you can call this from a worker thread.

## Edge cases

- **Cross-device targets**: the temp file is created in the same directory as the destination, so the rename never crosses filesystem boundaries. This is by design — a cross-device rename is not atomic.
- **Mode preservation**: by default, the new file inherits the mode of any existing destination file. If no file exists yet, it uses `0o666` (modified by the process umask). Pass `{ mode: 0o600 }` to set it explicitly.
- **Parent directories**: created automatically if they do not exist.
- **Temp file cleanup**: if the rename fails, the temp file is removed so nothing leaks.
