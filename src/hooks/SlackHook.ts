import axios from 'axios';
import { Hook, DownloadResult, HookConfig } from './Hook';

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

  async execute(result: DownloadResult, config?: HookConfig): Promise<void> {
    const slackConfigs = config?.slack;
    
    // Determine which URLs to notify: from config OR from env (if enabled)
    const urlsToNotify: string[] = [];
    
    if (slackConfigs && slackConfigs.length > 0) {
        slackConfigs.forEach((c: { webhookUrl: string }) => {
            if (c.webhookUrl) urlsToNotify.push(c.webhookUrl);
        });
    } else if (this.webhookUrl) {
        urlsToNotify.push(this.webhookUrl);
    }

    if (urlsToNotify.length === 0) return;

    console.log(`[SlackHook] Sending notifications to ${urlsToNotify.length} endpoint(s)...`);
    
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

    const notifications = urlsToNotify.map(async (url) => {
        try {
            await axios.post(url, payload);
            console.log(`[SlackHook] Notification sent successfully to: ${url}`);
        } catch (err) {
            console.error(`[SlackHook] Failed to send notification to ${url}`, err);
        }
    });

    await Promise.allSettled(notifications);
  }
}
