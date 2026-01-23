export interface DownloadResult {
  filePath: string;
  fileName: string;
  videoTitle: string; // The clean title extracted from metadata or filename
  sourceUrl: string;
}

export interface HookConfig {
  tiktok?: {
    clientKey?: string;
    clientSecret?: string;
    accessToken?: string;
    title?: string;
  };
  slack?: {
    webhookUrl: string;
  }[];
  webhook?: {
    url: string;
  }[];
}

export interface Hook {
  name: string;
  init(): Promise<void>;
  execute(result: DownloadResult, config?: HookConfig): Promise<void>;
}
