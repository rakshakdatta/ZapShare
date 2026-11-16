import { File, FileImage, FileText, Film } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatBytes } from '@/lib/transfer';
import type { FileInfo } from '@/lib/transfer';

function fileIcon(name: string) {
  if (/\.(mp4|mov|avi|mkv|webm)$/i.test(name)) return Film;
  if (/\.(jpg|jpeg|png|gif|webp|heic)$/i.test(name)) return FileImage;
  if (/\.(pdf|txt|md|docx?|rtf)$/i.test(name)) return FileText;
  return File;
}

export default function TransferFileRow({ file, children }: { file: FileInfo; children?: ReactNode }) {
  const Icon = fileIcon(file.name);

  return (
    <li className="flex min-w-0 items-center gap-2.5 py-2.5 text-sm">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-surface text-accent">
        <Icon size={16} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="leading-snug wrap-anywhere">{file.name}</p>
        <p className="mt-0.5 text-xs text-muted">{formatBytes(file.size)}</p>
      </div>
      {children}
    </li>
  );
}
