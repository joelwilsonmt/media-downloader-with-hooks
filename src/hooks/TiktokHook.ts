import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { Hook, DownloadResult, HookConfig } from './Hook';

export class TiktokHook implements Hook {
  name = 'TiktokHook';
  private clientKey: string;
  private clientSecret: string;
  private accessToken: string;
  private baseUrl = 'https://open.tiktokapis.com/v2';
  private enabled = false;

  constructor() {
    this.clientKey = process.env.TIKTOK_CLIENT_KEY || '';
    this.clientSecret = process.env.TIKTOK_CLIENT_SECRET || '';
    this.accessToken = process.env.TIKTOK_ACCESS_TOKEN || '';
  }

  async init(): Promise<void> {
    if (process.env.ENABLE_TIKTOK === 'true' && this.accessToken) {
        this.enabled = true;
        console.log('[TiktokHook] Enabled.');
    } else {
        if (process.env.ENABLE_TIKTOK === 'true' && !this.accessToken) {
             console.warn('[TiktokHook] Enabled but no access token provided. Disabled.');
        } else {
             console.log('[TiktokHook] Disabled.');
        }
        this.enabled = false;
    }
  }

  async execute(result: DownloadResult, config?: HookConfig): Promise<void> {
    const tiktokConfig = config?.tiktok;
    const accessToken = tiktokConfig?.accessToken || this.accessToken;

    if (!this.enabled && !tiktokConfig?.accessToken) return;

    const filePath = result.filePath;
    
    try {
      console.log(`[TikTok] Starting upload for ${filePath}`);
      const fileStats = fs.statSync(filePath);
      const fileSize = fileStats.size;

      // Step 1: Initialize Upload
      const initResponse = await axios.post(
        `${this.baseUrl}/post/publish/video/init/`,
        {
          post_info: {
            title: tiktokConfig?.title || result.videoTitle || path.basename(filePath),
            privacy_level: 'SELF_ONLY', // Default to private for safety
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
            video_cover_timestamp_ms: 1000,
          },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: fileSize,
            chunk_size: fileSize, 
            total_chunk_count: 1,
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
        }
      );

      const uploadUrl = initResponse.data?.data?.upload_url;
      if (!uploadUrl) {
        throw new Error('Failed to get upload URL from TikTok');
      }

      // Step 2: Upload Video File
      const fileStream = fs.createReadStream(filePath);
      await axios.put(uploadUrl, fileStream, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': fileSize,
          'Content-Range': `bytes 0-${fileSize - 1}/${fileSize}`,
        },
      });

      console.log('[TikTok] Upload successful');

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[TikTok] Upload failed:', errorMessage);
      // We re-throw so HookManager knows it failed
      throw new Error(`TikTok Upload Failed: ${errorMessage}`);
    }
  }
}
