import type { Job } from '@shared/schemas';
import { Settings2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Toaster } from 'sonner';
import { Composer } from '@/components/Composer';
import { Logo } from '@/components/Logo';
import { Queue } from '@/components/Queue';
import { SettingsSheet } from '@/components/SettingsSheet';
import { Button } from '@/components/ui/button';
import { useJobs } from '@/hooks/use-jobs';
import { saveToDevice } from '@/lib/api';
import { loadSettings, saveSettings } from '@/lib/settings';

const PENDING_KEY = 'device-pending';

/** Jobs this tab asked to send to the device; survives a reload, not a new tab. */
function readPending(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

export function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { jobs, connection } = useJobs();
  const pending = useRef(readPending());

  const persistPending = () => {
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify([...pending.current]));
    } catch {
      // Auto-save just won't survive a reload.
    }
  };

  const onQueued = (job: Job) => {
    if (job.destination === 'server') return;
    pending.current.add(job.id);
    persistPending();
  };

  // Hand finished files to the browser once, on the device that asked for them.
  useEffect(() => {
    let changed = false;
    for (const id of pending.current) {
      const job = jobs.get(id);
      // A job not seen yet may simply not have arrived over the event stream.
      if (!job) continue;
      if (job.status === 'failed' || job.status === 'cancelled') {
        pending.current.delete(id);
        changed = true;
      } else if (job.status === 'done' && job.downloadable) {
        saveToDevice(id);
        pending.current.delete(id);
        changed = true;
      }
    }
    if (changed) persistPending();
  }, [jobs]);

  return (
    <div className="min-h-dvh pb-[env(safe-area-inset-bottom)]">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <h1 className="flex items-center gap-2.5 text-[22px] font-semibold tracking-tight">
          <Logo className="size-7" />
          Media Downloader
        </h1>
        <Button variant="ghost" onClick={() => setSettingsOpen(true)}>
          <Settings2 />
          <span className="max-sm:sr-only">Settings</span>
        </Button>
      </header>

      <main className="mx-auto grid max-w-6xl items-start gap-x-14 gap-y-12 px-4 pt-4 pb-16 sm:px-6 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] lg:pt-8">
        <div>
          <Composer settings={settings} onQueued={onQueued} />
        </div>
        <Queue jobs={jobs} connection={connection} />
      </main>

      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSave={s => {
          saveSettings(s);
          setSettings(s);
        }}
      />
      <Toaster
        position="bottom-center"
        toastOptions={{
          classNames: {
            toast:
              '!bg-card !text-foreground !border-border !shadow-[0_8px_24px_-8px_oklch(0_0_0/0.3)] !font-sans',
            description: '!text-muted-foreground',
          },
        }}
      />
    </div>
  );
}
