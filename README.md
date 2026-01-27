# YouTube, TikTok & SoundCloud Downloader 🎥 ➡️ 🎵

A containerized TypeScript application designed to automate the flow of downloading content from YouTube, TikTok, and SoundCloud. Built with **Bun**, **Fastify**, and **Docker**.

## ✨ Features

- **📺 Multi-Platform Ingestion**: Full support for **YouTube**, **TikTok**, and **SoundCloud** with immediate visual verification via previews.
- **🎵 High-Fidelity Audio**: 
  - **Lossless WAV**: Specialized high-fidelity extraction for **SoundCloud** links.
  - **High-Quality MP3**: Bitrate-priority (V0) extraction for other audio-only downloads.
- **✂️ Time Range Selection**: Select specific segments of a video/track to download using an intuitive dual-handle range slider.
- **📂 Organized Storage**: Automatically separates files into `downloads/videos`, `downloads/audio`, and platform-specific subfolders if configured.
- **⚙️ Dynamic Hook Config**: Configure TikTok, Slack, and generic webhooks directly in the UI. Settings are persisted in **localStorage**.
- **☁️ Automated Deployment**: Ready-to-use **GitHub Actions** for building and pushing images to GHCR. View deployments in the [Actions](https://github.com/joelwilsonmt/media-downloader-with-hooks/actions) tab or the [Packages](https://github.com/joelwilsonmt/media-downloader-with-hooks/pkgs/container/media-downloader-with-hooks) section.
- **🛠 Self-Contained**: Automatically manages dependencies. No need to manually install `ffmpeg` or `yt-dlp`.

## 🛠 High-Level Architecture

1.  **Frontend**: A responsive Tailwind CSS interface.
2.  **Backend**: A Fastify server running on **Bun**.
    -   Fetches metadata (duration) via `/api/info`.
    -   Spawns `yt-dlp` for optimized downloads (`--download-sections` for ranges).
    -   Triggers platform-specific logic (e.g., WAV for SoundCloud).
    -   Triggers a chain of **Hooks** (TikTok, Slack, Webhooks) after download.

## 🚀 Deployment Guide

### Docker Compose Snippet

Add this to your `docker-compose.yml` to run the service:

```yaml
  youtube-saver:
    image: ghcr.io/joelwilsonmt/media-downloader-with-hooks:latest
    container_name: youtube-saver
    ports:
      - "9000:3000"
    volumes:
      - "${RIPPER}/Videos/Youtube downloads:/app/downloads"
    environment:
      - PORT=3000
    env_file:
      - .env
    restart: unless-stopped
```

### 1. Build & Push (CI/CD)
The included GitHub Action (`.github/workflows/deploy.yml`) handles this automatically:
- Every push to `main` builds a new Docker image.
- The image is pushed to **GitHub Container Registry (GHCR)**.

### 2. Server Setup (Manual)
Since this repository is **public**, you do not need a GitHub Personal Access Token (PAT) to pull the image. You can simply run `docker compose up -d`.

If you prefer to build locally or manage your own registry, you can still log in to GHCR:
```bash
echo "YOUR_GITHUB_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

## ⚙️ Configuration (UI)

Instead of hardcoding credentials in `.env`, you can now use the **Settings Modal** (gear icon) in the web UI. These settings are stored in your browser and used for all requests:
- **TikTok**: Client Key, Secret, and Access Token for auto-uploads.
- **Slack**: Supports multiple webhook URLs for download notifications.
- **Generic Webhooks**: Supports multiple callback URLs.

## 📁 Output Structure

All downloads are saved under the path defined by `DOWNLOAD_DIR`:
- `/videos/`: Full or partial video downloads (.mp4)
- `/audio/`: High-quality audio extraction (.mp3 or .wav)

## 🤝 Contributing

1.  Fork the repository.
2.  Create your feature branch (`git checkout -b feature/amazing-feature`).
3.  Commit your changes (`git commit -m 'Add some amazing feature'`).
4.  Push to the branch (`git push origin feature/amazing-feature`).
5.  Open a Pull Request.

## License

[MIT](LICENSE)

