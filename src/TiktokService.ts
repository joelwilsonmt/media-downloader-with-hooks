import axios from 'axios';
import fs from 'fs';
import path from 'path';

interface UploadResult {
  status: 'success' | 'skipped' | 'error';
  data?: unknown;
  message?: string;
  error?: string;
}

export class TiktokService {
  private clientKey: string;
  private clientSecret: string;
  private accessToken: string;
  private baseUrl = 'https://open.tiktokapis.com/v2';

  constructor() {
    this.clientKey = process.env.TIKTOK_CLIENT_KEY || '';
    this.clientSecret = process.env.TIKTOK_CLIENT_SECRET || '';
    this.accessToken = process.env.TIKTOK_ACCESS_TOKEN || '';
  }

  /**
   * Uploads a video to TikTok using the Direct Post API.
   * Note: This is a simplified flow. Real implementation deals with chunked uploads and status polling.
   */
  async uploadVideo(filePath: string): Promise<UploadResult> {
    if (!this.accessToken) {
      console.warn('TikTok access token not configured. Skipping upload.');
      return { status: 'skipped', message: 'No access token' };
    }

    try {
      console.log(`[TikTok] Starting upload for ${filePath}`);
      const fileStats = fs.statSync(filePath);
      const fileSize = fileStats.size;

      // Step 1: Initialize Upload
      const initResponse = await axios.post(
        `${this.baseUrl}/post/publish/video/init/`,
        {
          post_info: {
            title: path.basename(filePath),
            privacy_level: 'SELF_ONLY', // Default to private for safety
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
            video_cover_timestamp_ms: 1000,
          },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: fileSize,
            chunk_size: fileSize, // Uploading in one chunk for simplicity if small enough
            total_chunk_count: 1,
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
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
      return { status: 'success', data: initResponse.data };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // Safe access to axios response data if possible, but keeping it simple for now
      console.error('[TikTok] Upload failed:', errorMessage);
      // Don't throw for the background process, just return error state so app doesn't crash
      return { status: 'error', error: errorMessage }; 
    }
  }
}
