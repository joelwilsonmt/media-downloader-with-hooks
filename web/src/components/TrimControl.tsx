import { useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { formatDuration, parseDuration } from '@/lib/format';

interface Props {
  duration: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
}

export function TrimControl({ duration, value, onChange }: Props) {
  const [start, end] = value;
  return (
    <div className="space-y-1">
      <Slider
        min={0}
        max={duration}
        step={1}
        minStepsBetweenThumbs={1}
        value={value}
        onValueChange={v => onChange([v[0] ?? 0, v[1] ?? duration])}
      />
      <div className="flex items-end gap-3">
        <TimeInput
          label="Start"
          value={start}
          onCommit={s => onChange([Math.min(s, end - 1), end])}
        />
        <p className="flex-1 pb-2.5 text-center text-[13px] text-muted-foreground">
          <span className="font-mono">{formatDuration(end - start)}</span> of{' '}
          <span className="font-mono">{formatDuration(duration)}</span>
        </p>
        <TimeInput
          label="End"
          value={end}
          onCommit={e =>
            onChange([start, Math.min(duration, Math.max(e, start + 1))])
          }
        />
      </div>
    </div>
  );
}

function TimeInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (s: number) => void;
}) {
  // Holds the text only while editing; otherwise the field mirrors value.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const s = draft == null ? null : parseDuration(draft);
    if (s != null) onCommit(s);
    setDraft(null);
  };
  return (
    <label className="block w-24">
      <span className="mb-1 block text-[12px] text-muted-foreground">
        {label}
      </span>
      <input
        value={draft ?? formatDuration(value)}
        inputMode="numeric"
        onFocus={e => setDraft(e.target.value)}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        className="h-10 w-full rounded-md border border-input bg-card px-2.5 text-center font-mono text-[16px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none sm:text-sm"
      />
    </label>
  );
}
