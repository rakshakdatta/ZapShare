'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface LogEntry {
  transferId: string;
  senderId: string;
  receiverId: string;
  totalFiles: number;
  totalSize: number;
  timestamp: string;
}

export default function TransferLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await api.get<LogEntry[]>('/transfer');
        setLogs(response.data);
      } catch (error) {
        console.error('Failed to fetch logs:', error);
      }
    };

    fetchLogs();
  }, []);

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold mb-4">Transfer History</h2>
      <div className="space-y-3">
        {logs.length === 0 ? (
          <p className="text-gray-500 text-sm">No transfers found yet.</p>
        ) : (
          logs.map((log) => (
            <div key={log.transferId} className="p-3 border rounded shadow-sm">
              <p><strong>From:</strong> {log.senderId}</p>
              <p><strong>To:</strong> {log.receiverId}</p>
              <p><strong>Files:</strong> {log.totalFiles}</p>
              <p><strong>Size:</strong> {log.totalSize} bytes</p>
              <p><strong>Time:</strong> {new Date(log.timestamp).toLocaleString()}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
