import { Hook, DownloadResult } from './Hook';
import { TiktokHook } from './TiktokHook';
import { SlackHook } from './SlackHook';
import { WebhookHook } from './WebhookHook';

export class HookManager {
  private hooks: Hook[] = [];

  constructor() {
    this.registerHooks();
  }

  private registerHooks() {
    // We could load these dynamically or based on config.
    // For now, we will register all available hook classes, 
    // and let their 'init' method decide if they should be active based on env vars.
    
    // Note: We instantiate them here
    this.hooks.push(new TiktokHook());
    this.hooks.push(new SlackHook());
    this.hooks.push(new WebhookHook());
  }

  public async init() {
    console.log('[HookManager] Initializing hooks...');
    const initPromises = this.hooks.map(async (hook) => {
      try {
        await hook.init();
        console.log(`[HookManager] Hook initialized: ${hook.name}`);
      } catch (err) {
        console.warn(`[HookManager] Hook failed to initialize (skipping): ${hook.name}`, err);
        // We remove failed hooks from the active list if necessary, 
        // or effectively disable them if they flag themselves as disabled.
        // For simplicity, we'll keep them but they might no-op in execute.
      }
    });
    await Promise.all(initPromises);
  }

  public async notify(result: DownloadResult) {
    console.log(`[HookManager] Notifying hooks for: ${result.fileName}`);
    
    // we use allSettled so one failure doesn't stop others
    const results = await Promise.allSettled(this.hooks.map(async (hook) => {
      console.log(`[HookManager] Executing hook: ${hook.name}`);
      await hook.execute(result);
    }));

    results.forEach((res, index) => {
      const hookName = this.hooks[index].name;
      if (res.status === 'fulfilled') {
        console.log(`[HookManager] Hook success: ${hookName}`);
      } else {
        console.error(`[HookManager] Hook failed: ${hookName}`, res.reason);
      }
    });
  }
}
