'use client';

interface Props {
  progress: number; // 0 to 100
}

export default function ProgressBar({ progress }: Props) {
  const percent = Math.max(0, Math.min(100, progress));

  return (
    <div
      role="progressbar"
      aria-label="File transfer progress"
      aria-valuenow={Math.round(percent)}
      className="h-2 w-full overflow-hidden rounded-full bg-background"
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-200 motion-reduce:transition-none"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
