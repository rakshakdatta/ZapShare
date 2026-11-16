export type FileInfo = { name: string; size: number };

export type Receiver = { code: string; name: string; busy: boolean };

export type IncomingTransfer = {
  id: string;
  sender: string;
  files: FileInfo[];
};

export type SignalMessage =
  | { id: string; type: 'offer' | 'answer'; data: RTCSessionDescriptionInit }
  | { id: string; type: 'candidate'; data: RTCIceCandidateInit };

export type EndReason = 'completed' | 'declined' | 'cancelled' | 'disconnected' | 'expired';

export const historySaveError = 'The files arrived, but this transfer could not be saved to history.';

export const endMessages: Record<Exclude<EndReason, 'completed'>, string> = {
  declined: 'The receiver declined the transfer.',
  cancelled: 'The transfer was cancelled.',
  disconnected: 'The other device disconnected.',
  expired: 'The transfer request expired.',
};

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)) - 1, units.length - 1);
  return `${(bytes / 1024 ** (index + 1)).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  })} ${units[index]}`;
}

export function totalBytes(files: FileInfo[]) {
  return files.reduce((sum, file) => sum + file.size, 0);
}
