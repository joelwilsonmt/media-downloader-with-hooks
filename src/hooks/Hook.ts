export interface DownloadResult {
  filePath: string;
  fileName: string;
  videoTitle: string; // The clean title extracted from metadata or filename
  sourceUrl: string;
}

export interface Hook {
  name: string;
  init(): Promise<void>;
  execute(result: DownloadResult): Promise<void>;
}
