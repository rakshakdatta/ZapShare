import { getBackendUrl } from './backend-url';
import type { FileInfo } from './transfer';

export const sessionChangeKey = 'zapshare.session-change';
const legacyProfileStorageKey = 'zapshare.profile-key';

export type Profile = { name: string; username: string; email: string | null };
export type Direction = 'sent' | 'received';
export type HistoryEntry = {
  id: string;
  otherName: string;
  files: FileInfo[];
  completedAt: string;
};
export type HistoryPage = { items: HistoryEntry[]; nextOffset: number | null };

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const response = await fetch(`${getBackendUrl()}${path}`, {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { message?: string };
    throw new ApiError(response.status, error.message ?? 'ZapShare could not complete the request.');
  }
  return response.json() as Promise<T>;
}

function notifySessionChange() {
  try {
    window.localStorage.setItem(sessionChangeKey, String(Date.now()));
  } catch {
    // The current page can continue if other tabs cannot be notified.
  }
}

export function loadProfile() {
  return request<Profile>('/auth/session');
}

export function renameProfile(name: string) {
  return request<{ name: string }>('/device/profile', 'PATCH', { name });
}

export function loadHistory(direction: Direction, offset = 0) {
  return request<HistoryPage>(`/device/history?direction=${direction}&offset=${offset}`);
}

export async function logIn(identifier: string, password: string) {
  await request('/auth/login', 'POST', { identifier, password });
  notifySessionChange();
}

export async function signUp(username: string, email: string, password: string) {
  let legacy: string | undefined;
  try {
    const stored = window.localStorage.getItem(legacyProfileStorageKey);
    if (stored && /^[a-f0-9]{64}$/i.test(stored)) legacy = stored;
  } catch {
    // A new profile can still be created.
  }
  await request('/auth/signup', 'POST', { username, email, password, legacy });
  try {
    window.localStorage.removeItem(legacyProfileStorageKey);
  } catch {
    // The server has already saved the account.
  }
  notifySessionChange();
}

export async function logOut() {
  await request('/auth/logout', 'POST');
  notifySessionChange();
}
