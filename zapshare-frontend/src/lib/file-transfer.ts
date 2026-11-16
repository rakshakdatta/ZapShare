import type { FileInfo } from './transfer';

const chunkBytes = 16 * 1024;
const windowBytes = 2 * 1024 * 1024;
const bufferLimit = 512 * 1024;
const idleTimeout = 45_000;

type Progress = (fileIndex: number, fileBytes: number) => void;
type Sink = {
  write(chunk: ArrayBuffer): void | Promise<void>;
  finish(): Promise<Blob | undefined>;
  abort(): void | Promise<void>;
};

function waitForChannelEvent(
  channel: RTCDataChannel,
  event: 'message' | 'bufferedamountlow',
  matches: (event: Event) => boolean,
  send?: () => Promise<void>,
) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => fail(new Error('The other device stopped responding.')),
      idleTimeout,
    );
    const cleanup = () => {
      clearTimeout(timeout);
      channel.removeEventListener(event, onEvent);
      channel.removeEventListener('close', onClose);
      channel.removeEventListener('error', onClose);
    };
    const fail = (error: unknown) => {
      cleanup();
      reject(error);
    };
    const onClose = () => fail(new Error('The file connection closed.'));
    const onEvent = (message: Event) => {
      try {
        if (!matches(message)) return;
        cleanup();
        resolve();
      } catch (error) {
        fail(error);
      }
    };

    if (channel.readyState !== 'open') return onClose();
    channel.addEventListener(event, onEvent);
    channel.addEventListener('close', onClose);
    channel.addEventListener('error', onClose);
    void send?.().catch(fail);
  });
}

function waitForWindow(
  channel: RTCDataChannel,
  file: File,
  index: number,
  start: number,
  end: number,
) {
  return waitForChannelEvent(
    channel,
    'message',
    (event) => {
      const { data } = event as MessageEvent;
      const ack = typeof data === 'string' ? JSON.parse(data) : null;
      if (ack?.type !== 'ack' || ack.index !== index || ack.offset !== end) {
        throw new Error('The receiver sent an invalid acknowledgment.');
      }
      return true;
    },
    async () => {
      if (file.size === 0) {
        channel.send(JSON.stringify({ type: 'empty', index }));
        return;
      }
      const data = await file.slice(start, end).arrayBuffer();
      for (let offset = 0; offset < data.byteLength; offset += chunkBytes) {
        if (channel.bufferedAmount > bufferLimit) {
          await waitForChannelEvent(channel, 'bufferedamountlow', () => true);
        }
        channel.send(data.slice(offset, offset + chunkBytes));
      }
    },
  );
}

export async function sendFiles(channel: RTCDataChannel, files: File[], onProgress: Progress) {
  channel.bufferedAmountLowThreshold = bufferLimit;

  for (const [index, file] of files.entries()) {
    if (file.size === 0) {
      await waitForWindow(channel, file, index, 0, 0);
      onProgress(index, 0);
      continue;
    }
    for (let start = 0; start < file.size; start += windowBytes) {
      const end = Math.min(start + windowBytes, file.size);
      await waitForWindow(channel, file, index, start, end);
      onProgress(index, end);
    }
  }
}

export function folderPicker() {
  return (window as Window & {
    showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  }).showDirectoryPicker;
}

async function createSink(name: string, directory?: FileSystemDirectoryHandle): Promise<Sink> {
  if (!directory) {
    const chunks: ArrayBuffer[] = [];
    return {
      write: (chunk) => { chunks.push(chunk); },
      async finish() {
        const blob = new Blob(chunks, { type: 'application/octet-stream' });
        chunks.length = 0;
        return blob;
      },
      abort: () => { chunks.length = 0; },
    };
  }

  const extensionIndex = name.lastIndexOf('.');
  const stem = extensionIndex > 0 ? name.slice(0, extensionIndex) : name;
  const extension = extensionIndex > 0 ? name.slice(extensionIndex) : '';
  let outputName = name;
  for (let count = 1; ; count++) {
    try {
      await directory.getFileHandle(outputName);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') break;
      if (!(error instanceof DOMException && error.name === 'TypeMismatchError')) throw error;
    }
    outputName = `${stem} (${count})${extension}`;
  }

  const handle = await directory.getFileHandle(outputName, { create: true });
  try {
    const writer = await handle.createWritable();
    return {
      write: (chunk) => writer.write(chunk),
      async finish() {
        await writer.close();
        return undefined;
      },
      async abort() {
        try {
          await writer.abort();
        } finally {
          await directory.removeEntry(outputName);
        }
      },
    };
  } catch (error) {
    await directory.removeEntry(outputName).catch(() => undefined);
    throw error;
  }
}

type ReceiveOptions = {
  directory?: FileSystemDirectoryHandle;
  onProgress: Progress;
  onFile: (index: number, blob: Blob | undefined) => void;
  onDone: () => void;
  onError: (error: unknown) => void;
};

export function receiveFiles(channel: RTCDataChannel, files: FileInfo[], options: ReceiveOptions) {
  let index = 0;
  let offset = 0;
  let acknowledgedOffset = 0;
  let sink: Sink | undefined;
  let stopped = false;
  let queuedBytes = 0;
  let queue = Promise.resolve();

  function stop() {
    if (stopped) return;
    stopped = true;
    channel.removeEventListener('message', onMessage);
    void queue.then(() => sink?.abort()).catch(() => undefined);
  }

  function fail(error: unknown) {
    if (stopped) return;
    stop();
    options.onError(error);
  }

  async function receive(data: unknown) {
    const file = files[index];
    if (!file) throw new Error('Unexpected data after the last file.');

    if (data instanceof ArrayBuffer) {
      if (data.byteLength === 0 || data.byteLength > chunkBytes ||
          offset + data.byteLength > file.size ||
          offset + data.byteLength - acknowledgedOffset > windowBytes) {
        throw new Error('The sender sent an invalid file chunk.');
      }
      sink ??= await createSink(file.name, options.directory);
      if (stopped) return;
      await sink.write(data);
      offset += data.byteLength;
    } else {
      const empty = typeof data === 'string' ? JSON.parse(data) : null;
      if (empty?.type !== 'empty' || empty.index !== index || file.size !== 0) {
        throw new Error('The sender sent an invalid file message.');
      }
      sink ??= await createSink(file.name, options.directory);
    }
    if (stopped) return;

    const fileDone = offset === file.size;
    if (!fileDone && offset - acknowledgedOffset < windowBytes) return;

    if (fileDone) {
      const blob = await sink.finish();
      sink = undefined;
      if (stopped) return;
      options.onFile(index, blob);
    }
    channel.send(JSON.stringify({ type: 'ack', index, offset }));
    options.onProgress(index, offset);
    acknowledgedOffset = offset;

    if (fileDone) {
      index++;
      offset = 0;
      acknowledgedOffset = 0;
      if (index === files.length) {
        stop();
        options.onDone();
      }
    }
  }

  let queuedMessages = 0;
  function onMessage({ data }: MessageEvent) {
    if (stopped) return;
    const bytes = data instanceof ArrayBuffer ? data.byteLength : 0;
    queuedBytes += bytes;
    queuedMessages++;
    if (queuedBytes > windowBytes || queuedMessages > windowBytes / chunkBytes + 1) {
      fail(new Error('The sender exceeded the receive buffer.'));
      return;
    }
    queue = queue.then(async () => {
      try {
        if (!stopped) await receive(data);
      } catch (error) {
        fail(error);
      } finally {
        queuedBytes -= bytes;
        queuedMessages--;
      }
    });
  }

  channel.addEventListener('message', onMessage);
  return stop;
}
