# YouTube Downloader & TikTok Automator 🎥 ➡️ 📱

A containerized TypeScript application designed to automate the flow of downloading content from YouTube and uploading it to TikTok. Built with **Bun**, **Fastify**, and **Docker**.

## ✨ Features

- **📺 YouTube Ingestion**: Modern web interface with **iframe previews** for immediate visual verification.
- **✂️ Time Range Selection**: Select specific segments of a video to download using an intuitive dual-handle range slider.
- **🎵 Audio-Only Mode**: Extract high-quality **MP3** files instead of video.
- **📂 Organized Storage**: Automatically separates files into `downloads/videos` and `downloads/audio`.
- **⚙️ Dynamic Hook Config**: Configure TikTok, Slack, and generic webhooks directly in the UI. Settings are persisted in **localStorage**.
- **� Automated Deployment**: Ready-to-use **GitHub Actions** for building and pushing private Docker images to GHCR.
- **� Self-Contained**: Automatically manages dependencies. No need to manually install `ffmpeg` or `yt-dlp`.

## 🛠 High-Level Architecture

1.  **Frontend**: A responsive Tailwind CSS interface.
2.  **Backend**: A Fastify server running on **Bun**.
    -   Fetches video metadata (duration) via `/api/info`.
    -   Spawns `yt-dlp` for optimized downloads (`--download-sections` for ranges).
    -   Triggers a chain of **Hooks** (TikTok, Slack, Webhooks) after download.

## 🚀 Deployment Guide (Remote Server)

This project is optimized for automated deployment from a **private repository**.

### 1. Build & Push (CI/CD)
The included GitHub Action (`.github/workflows/deploy.yml`) handles this automatically:
- Every push to `main` builds a new Docker image.
- The image is pushed to **GitHub Container Registry (GHCR)**.

### 2. Server Setup
On your remote server, you only need `docker` and `docker-compose`.

#### Authentication
Login once to GHCR using a **Personal Access Token (PAT)**:
```bash
echo "YOUR_PAT_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

#### Launch
Create a folder, add your `.env`, and use the provided `docker-compose.yml`:
```bash
# Start the service
docker-compose up -d
```
> [!TIP]
> Make sure to update the `image` field in `docker-compose.yml` to point to your repository.

## ⚙️ Configuration (UI)

Instead of hardcoding credentials in `.env`, you can now use the **Settings Modal** (gear icon) in the web UI. These settings are stored in your browser and used for all requests:
- **TikTok**: Client Key, Secret, and Access Token.
- **Slack**: Supports multiple webhook URLs.
- **Generic Webhooks**: Supports multiple callback URLs.

## 📁 Output Structure

All downloads are saved under the path defined by `DOWNLOAD_DIR`:
- `/videos/`: Full or partial video downloads (.mp4)
- `/audio/`: High-quality audio extraction (.mp3)

## 🤝 Contributing

1.  Fork the repository.
2.  Create your feature branch (`git checkout -b feature/amazing-feature`).
3.  Commit your changes (`git commit -m 'Add some amazing feature'`).
4.  Push to the branch (`git push origin feature/amazing-feature`).
5.  Open a Pull Request.

## License

[MIT](LICENSE)
