import axios from 'axios';
import { Hook, DownloadResult } from './Hook';

export class SlackHook implements Hook {
  name = 'SlackHook';
  private webhookUrl: string | undefined;

  async init(): Promise<void> {
    this.webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!this.webhookUrl) {
      // Not configured, but that's fine, we just won't execute
      console.log('[SlackHook] No webhook URL configured. Slack hook disabled.');
      return;
    }
    // Check enable flag
    if (process.env.ENABLE_SLACK !== 'true') {
        console.log('[SlackHook] ENABLE_SLACK is not true. Disabled.');
        this.webhookUrl = undefined;
    }
  }

  async execute(result: DownloadResult): Promise<void> {
    if (!this.webhookUrl) return;

    console.log('[SlackHook] Sending notification...');
    
    try {
        const payload = {
            text: `🎬 *New Video Downloaded*`,
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `*${result.videoTitle}*\nSource: ${result.sourceUrl}`
                    }
                },
                {
                    type: "section",
                    fields: [
                        {
                            type: "mrkdwn",
                            text: `*File:*\n${result.fileName}`
                        },
                        {
                            type: "mrkdwn",
                            text: `*Status:*\nDownloaded ✅`
                        }
                    ]
                }
            ]
        };

        await axios.post(this.webhookUrl, payload);
        console.log('[SlackHook] Notification sent successfully.');
    } catch (err) {
        console.error('[SlackHook] Failed to send notification', err);
        // We throw so HookManager knows it failed (it catches via allSettled)
        throw err;
    }
  }
}
