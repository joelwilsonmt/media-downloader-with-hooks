import type { Detected } from '@shared/services';
import { ClipboardPaste, X } from 'lucide-react';
import { forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ServiceBadge } from './ServiceBadge';

const canPaste = () =>
  typeof navigator !== 'undefined' &&
  window.isSecureContext &&
  !!navigator.clipboard?.readText;

interface Props {
  value: string;
  onChange: (value: string) => void;
  detected: Detected | null;
}

export const UrlField = forwardRef<HTMLInputElement, Props>(function UrlField(
  { value, onChange, detected },
  ref
) {
  const invalid = value.trim() !== '' && !detected;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor="url" className="text-[13px] font-medium">
          Link
        </label>
        <kbd className="hidden font-mono text-[12px] text-muted-foreground sm:block">
          ⌘K
        </kbd>
      </div>
      <div
        className={cn(
          'flex h-13 items-center gap-2 rounded-lg border border-input bg-card pr-1.5 pl-2 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25',
          invalid &&
            'border-destructive focus-within:border-destructive focus-within:ring-destructive/20'
        )}
      >
        {detected && <ServiceBadge service={detected.service} />}
        <input
          ref={ref}
          id="url"
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Paste a video, track or playlist link"
          aria-invalid={invalid || undefined}
          aria-describedby="url-hint"
          className="h-full min-w-0 flex-1 bg-transparent px-1 text-[16px] outline-none placeholder:text-muted-foreground/80 focus-visible:outline-none"
        />
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onChange('')}
            aria-label="Clear link"
          >
            <X />
          </Button>
        ) : (
          canPaste() && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={async () =>
                onChange(await navigator.clipboard.readText().catch(() => ''))
              }
            >
              <ClipboardPaste />
              Paste
            </Button>
          )
        )}
      </div>
      <p
        id="url-hint"
        className={cn(
          'mt-2 text-[13px] text-muted-foreground',
          invalid && 'text-destructive'
        )}
      >
        {invalid
          ? 'That doesn’t look like a link.'
          : 'YouTube, SoundCloud, Spotify, Apple Music, TikTok, Vimeo, Bandcamp and anything else yt-dlp supports.'}
      </p>
    </div>
  );
});
