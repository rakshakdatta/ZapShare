'use client';

interface Props {
  status: 'disconnected' | 'connecting' | 'connected';
  trusted?: boolean; // Optional flag for trust indicator
}

export default function ConnectionStatus({ status, trusted = false }: Props) {
  const statusColor: Record<Props['status'], string> = {
    disconnected: 'text-red-600',
    connecting: 'text-yellow-500',
    connected: 'text-green-500',
  };

  const statusLabel: Record<Props['status'], string> = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    connected: 'Connected',
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <span
          className={`w-2.5 h-2.5 rounded-full ${statusColor[status]} animate-pulse`}
          title={statusLabel[status]}
        />
        <p className={`text-sm font-medium ${statusColor[status]}`}>
          Connection: {statusLabel[status]}
        </p>
      </div>

      {trusted && (
        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-400 font-medium">
          Trusted
        </span>
      )}
    </div>
  );
}
