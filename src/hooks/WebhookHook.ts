import axios from 'axios';
import { Hook, DownloadResult, HookConfig } from './Hook';

export class WebhookHook implements Hook {
  name = 'WebhookHook';
  private targetUrl: string | undefined;

  async init(): Promise<void> {
    this.targetUrl = process.env.GENERIC_WEBHOOK_URL;
    if (!this.targetUrl) {
      return;
    }
  }

  async execute(result: DownloadResult, config?: HookConfig): Promise<void> {
    const webhookConfigs = config?.webhook;
    
    const urlsToNotify: string[] = [];
    if (webhookConfigs && webhookConfigs.length > 0) {
        webhookConfigs.forEach((c: { url: string }) => {
            if (c.url) urlsToNotify.push(c.url);
        });
    } else if (this.targetUrl) {
        urlsToNotify.push(this.targetUrl);
    }

    if (urlsToNotify.length === 0) return;

    console.log(`[WebhookHook] Posting to ${urlsToNotify.length} endpoint(s)...`);
    
    const notifications = urlsToNotify.map(async (url) => {
        try {
            await axios.post(url, result);
            console.log(`[WebhookHook] Post successful to: ${url}`);
        } catch (err) {
            console.error(`[WebhookHook] Failed to post to webhook: ${url}`, err);
        }
    });

    await Promise.allSettled(notifications);
  }
}
