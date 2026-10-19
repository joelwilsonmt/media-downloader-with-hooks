import { Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { cookieSummary, sanitizeCookies, type Settings } from '@/lib/settings';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  onSave: (settings: Settings) => void;
}

export function SettingsSheet({ open, onOpenChange, settings, onSave }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        aria-describedby="settings-description"
        // Focusing the first field would open the keyboard on phones.
        onOpenAutoFocus={e => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus();
        }}
      >
        {/* Remount on open so Cancel always discards edits. */}
        {open && (
          <SettingsForm
            initial={settings}
            onSave={onSave}
            onDone={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function SettingsForm({
  initial,
  onSave,
  onDone,
}: {
  initial: Settings;
  onSave: Props['onSave'];
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft(d => ({ ...d, [key]: value }));
  const summary = cookieSummary(draft.cookies);

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={e => {
        e.preventDefault();
        onSave({
          ...draft,
          slack: draft.slack.map(s => s.trim()).filter(Boolean),
          webhooks: draft.webhooks.map(s => s.trim()).filter(Boolean),
        });
        toast.success('Settings saved');
        onDone();
      }}
    >
      <header className="border-b px-5 pt-5 pb-4">
        <SheetTitle className="text-lg font-semibold tracking-tight">
          Settings
        </SheetTitle>
        <SheetDescription
          id="settings-description"
          className="mt-0.5 text-[13px] text-muted-foreground"
        >
          Stored in this browser only and sent with each download.
        </SheetDescription>
      </header>

      <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-5 py-6">
        <Section
          title="Cookies"
          description="Signed-in cookies let yt-dlp fetch age-restricted, private or members-only media, and stop YouTube's bot checks."
        >
          <Textarea
            aria-label="Cookies in Netscape format"
            value={draft.cookies}
            onChange={e => set('cookies', e.target.value)}
            placeholder="# Netscape HTTP Cookie File"
            spellCheck={false}
            className="h-36 font-mono text-[12px] sm:text-[12px]"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[12px] text-muted-foreground">
              {summary ?? 'No cookies'}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!draft.cookies.trim()}
              onClick={() => set('cookies', sanitizeCookies(draft.cookies))}
            >
              Keep supported sites only
            </Button>
          </div>
          <details className="text-[13px]">
            <summary className="cursor-pointer font-medium">
              How to export cookies cleanly
            </summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>Open a private window and sign in to the site only.</li>
              <li>
                Export with the{' '}
                <span className="text-foreground">Get cookies.txt LOCALLY</span>{' '}
                extension.
              </li>
              <li>
                Close the private window right away so the cookies don’t rotate.
              </li>
              <li>Paste here, then tap Keep supported sites only.</li>
            </ol>
          </details>
        </Section>

        <Section
          title="Slack"
          description="Post a message to each webhook when a download lands in the library."
        >
          <UrlList
            values={draft.slack}
            onChange={v => set('slack', v)}
            placeholder="https://hooks.slack.com/services/…"
            addLabel="Add Slack webhook"
          />
        </Section>

        <Section
          title="Webhooks"
          description="POST the file name, title and source URL as JSON after each library download."
        >
          <UrlList
            values={draft.webhooks}
            onChange={v => set('webhooks', v)}
            placeholder="https://example.com/hook"
            addLabel="Add webhook"
          />
        </Section>

        <Section
          title="TikTok"
          description="Upload each library video to your TikTok drafts as private."
        >
          <Field label="Client key">
            {id => (
              <Input
                id={id}
                value={draft.tiktok.clientKey}
                onChange={e =>
                  set('tiktok', { ...draft.tiktok, clientKey: e.target.value })
                }
                autoComplete="off"
              />
            )}
          </Field>
          <Field label="Client secret">
            {id => (
              <Input
                id={id}
                type="password"
                value={draft.tiktok.clientSecret}
                onChange={e =>
                  set('tiktok', {
                    ...draft.tiktok,
                    clientSecret: e.target.value,
                  })
                }
                autoComplete="off"
              />
            )}
          </Field>
          <Field label="Access token">
            {id => (
              <Input
                id={id}
                type="password"
                value={draft.tiktok.accessToken}
                onChange={e =>
                  set('tiktok', {
                    ...draft.tiktok,
                    accessToken: e.target.value,
                  })
                }
                autoComplete="off"
              />
            )}
          </Field>
        </Section>
      </div>

      <footer className="flex gap-3 border-t px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetClose asChild>
          <Button type="button" variant="secondary" className="flex-1">
            Cancel
          </Button>
        </SheetClose>
        <Button type="submit" className="flex-1">
          Save settings
        </Button>
      </footer>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
    </div>
  );
}

function UrlList({
  values,
  onChange,
  placeholder,
  addLabel,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  addLabel: string;
}) {
  return (
    <div className="space-y-2">
      {values.map((v, i) => (
        <div key={i} className="flex gap-1.5">
          <Input
            type="url"
            value={v}
            placeholder={placeholder}
            aria-label={`${addLabel.replace('Add ', '')} ${i + 1}`}
            onChange={e =>
              onChange(values.map((x, j) => (j === i ? e.target.value : x)))
            }
          />
          <Button
            type="button"
            variant="danger"
            size="icon"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
            aria-label="Remove"
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...values, ''])}
      >
        <Plus />
        {addLabel}
      </Button>
    </div>
  );
}
