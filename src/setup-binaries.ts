import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BIN_DIR = path.join(process.cwd(), 'bin');
const YT_DLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
const YT_DLP_PATH = path.join(BIN_DIR, 'yt-dlp');

async function setup() {
    console.log('[Setup] Checking binaries...');

    if (process.env.IS_DOCKER) {
        console.log('[Setup] Running in Docker. Skipping local binary download (relying on system packages).');
        return;
    }

    if (!fs.existsSync(BIN_DIR)) {
        fs.mkdirSync(BIN_DIR, { recursive: true });
    }

    // Check and Update yt-dlp
    if (!fs.existsSync(YT_DLP_PATH)) {
        console.log('[Setup] yt-dlp not found locally. Downloading...');
        try {
            execSync(`curl -L ${YT_DLP_URL} -o "${YT_DLP_PATH}"`);
            fs.chmodSync(YT_DLP_PATH, 0o755);
            console.log('[Setup] yt-dlp downloaded and made executable.');
        } catch (error) {
            console.error('[Setup] Failed to download yt-dlp:', error);
            process.exit(1);
        }
    } else {
        console.log('[Setup] yt-dlp found locally. Checking for updates...');
        try {
            // Use the built-in update command
            execSync(`"${YT_DLP_PATH}" -U`);
            console.log('[Setup] yt-dlp update check completed.');
        } catch (error) {
            console.warn('[Setup] Failed to update yt-dlp (continuing with existing version):', error);
        }
    }

    // Check ffmpeg
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ffmpegStatic = require('ffmpeg-static');
        if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
             console.log(`[Setup] ffmpeg-static found at: ${ffmpegStatic}`);
        } else {
             console.warn('[Setup] ffmpeg-static not resolving correctly.');
        }
    } catch (e) {
        console.warn('[Setup] ffmpeg-static not installed?');
    }

    // Check ffprobe
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ffprobeStatic = require('ffprobe-static');
        if (ffprobeStatic && ffprobeStatic.path && fs.existsSync(ffprobeStatic.path)) {
             console.log(`[Setup] ffprobe-static found at: ${ffprobeStatic.path}`);
        } else {
             console.warn('[Setup] ffprobe-static not resolving correctly.');
        }
    } catch (e) {
        console.warn('[Setup] ffprobe-static not installed?');
    }
}

setup().catch(err => {
    console.error(err);
    process.exit(1);
});
