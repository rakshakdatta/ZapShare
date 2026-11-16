import { Zap } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import AccountMenu from './AccountMenu';

type Mode = 'send' | 'receive' | 'history' | 'profile';
type Props = {
  mode: Mode;
  status: 'connecting' | 'ready' | 'offline';
  children: ReactNode;
};

const modes = [
  { key: 'send', label: 'Send', href: '/send' },
  { key: 'receive', label: 'Receive', href: '/receive' },
] as const;
const titles: Record<Mode, string> = {
  send: 'Send files', receive: 'Receive files', history: 'History', profile: 'Profile',
};

const serverStatus = {
  connecting: { label: 'Connecting to local server', color: 'text-warning' },
  ready: { label: 'Local server online', color: 'text-success' },
  offline: { label: 'Local server unreachable', color: 'text-danger' },
};

export default function TransferShell({ mode, status, children }: Props) {
  const connection = serverStatus[status];

  return (
    <div className="min-h-screen">
      <header className="border-b border-outline bg-surface">
        <div className="mx-auto grid max-w-[1060px] grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[1fr_auto_1fr] sm:px-6">
          <Link href="/" className="flex min-h-11 w-fit items-center gap-2 rounded-sm font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <span className="grid size-9 place-items-center rounded-lg bg-accent-surface text-accent">
              <Zap size={18} aria-hidden="true" />
            </span>
            ZapShare
          </Link>
          <nav aria-label="Transfer mode" className="col-span-2 row-start-2 flex gap-1 rounded-xl bg-background p-1 sm:col-span-1 sm:row-start-auto">
            {modes.map(({ key, label, href }) => (
              <Link
                key={key}
                href={href}
                aria-current={mode === key ? 'page' : undefined}
                className="flex min-h-11 flex-1 items-center justify-center rounded-lg px-4 text-sm text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent aria-[current=page]:bg-accent-surface aria-[current=page]:text-accent sm:min-h-10"
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 justify-self-end sm:gap-3">
            <p role="status" className={`flex items-center gap-1.5 text-right text-xs ${connection.color}`}>
              <span className="size-2 shrink-0 rounded-full bg-current" aria-hidden="true" />
              {connection.label}
            </p>
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className={`mx-auto px-4 pt-7 pb-10 sm:px-8 sm:pt-9 ${mode === 'send' ? 'max-w-[1024px]' : 'max-w-[660px]'}`}>
        <h1 className="mb-5 text-[28px] leading-tight font-bold tracking-[-0.035em] sm:text-[32px]">
          {titles[mode]}
        </h1>
        {status === 'offline' && (
          <p className="transfer-panel mb-4 text-sm text-danger">
            Check that the ZapShare backend is running and this device can reach the host.
          </p>
        )}
        {children}
      </main>
    </div>
  );
}
