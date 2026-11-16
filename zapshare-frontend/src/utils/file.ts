// utils/file.ts

/**
 * Converts a File object to an ArrayBuffer for WebRTC transfer.
 */
export const fileToArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Saves a received Blob to local filesystem using anchor download trick.
 * This is browser-controlled; actual saving is automatic in APK builds.
 */
export const saveFile = (blob: Blob, fileName: string) => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

/**
 * Splits a buffer into smaller chunks for streaming over WebRTC.
 */
export const chunkBuffer = (buffer: ArrayBuffer, chunkSize = 16 * 1024) => {
  const chunks: ArrayBuffer[] = [];
  const byteLength = buffer.byteLength;
  let offset = 0;

  while (offset < byteLength) {
    const end = Math.min(offset + chunkSize, byteLength);
    chunks.push(buffer.slice(offset, end));
    offset = end;
  }

  return chunks;
};

/**
 * Reconstructs an ArrayBuffer from received chunks.
 */
export const mergeChunks = (chunks: ArrayBuffer[]): ArrayBuffer => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  chunks.forEach(chunk => {
    result.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  });

  return result.buffer;
};
