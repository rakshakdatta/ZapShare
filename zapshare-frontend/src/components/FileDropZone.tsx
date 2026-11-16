'use client';

import { Plus, Upload } from 'lucide-react';
import { useId } from 'react';
import type { ReactNode } from 'react';

interface Props {
  onFilesSelected: (files: FileList) => void;
  disabled?: boolean;
  children?: ReactNode;
}

export default function FileDropZone({ onFilesSelected, disabled = false, children }: Props) {
  const inputId = useId();

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (!disabled && event.dataTransfer.files.length) {
          onFilesSelected(event.dataTransfer.files);
        }
      }}
    >
      {children}
      <input
        id={inputId}
        type="file"
        multiple
        disabled={disabled}
        className="peer sr-only"
        onChange={(event) => {
          if (event.target.files?.length) {
            onFilesSelected(event.target.files);
            event.target.value = '';
          }
        }}
      />
      {children ? (
        <label
          htmlFor={inputId}
          className="transfer-link mt-1.5 inline-flex min-h-11 cursor-pointer items-center gap-1.5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
        >
          <Plus size={16} aria-hidden="true" />
          Add files
        </label>
      ) : (
        <label
          htmlFor={inputId}
          className="mt-3 flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-outline p-4 text-center transition-colors hover:border-accent hover:bg-accent-surface/40 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
        >
          <span className="grid size-10 place-items-center rounded-lg bg-accent-surface text-accent">
            <Upload size={18} aria-hidden="true" />
          </span>
          <span className="text-sm font-medium">Choose files</span>
          <span className="text-xs text-muted">or drop them here</span>
        </label>
      )}
    </div>
  );
}
