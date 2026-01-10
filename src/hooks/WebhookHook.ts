import axios from 'axios';
import { Hook, DownloadResult } from './Hook';

export class WebhookHook implements Hook {
  name = 'WebhookHook';
  private targetUrl: string | undefined;

  async init(): Promise<void> {
    this.targetUrl = process.env.GENERIC_WEBHOOK_URL;
    if (!this.targetUrl) {
      return;
    }
  }

  async execute(result: DownloadResult): Promise<void> {
    if (!this.targetUrl) return;

    console.log(`[WebhookHook] Posting to ${this.targetUrl}...`);
    
    try {
        await axios.post(this.targetUrl, result);
        console.log('[WebhookHook] Post successful.');
    } catch (err) {
        console.error('[WebhookHook] Failed to post to webhook', err);
        throw err;
    }
  }
}
