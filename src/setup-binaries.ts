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

    // Check yt-dlp
    if (!fs.existsSync(YT_DLP_PATH)) {
        console.log('[Setup] yt-dlp not found locally. Downloading...');
        try {
            // Using curl via exec because it's reliable and installed on most devs/mac
            // Alternatively could use fetch and fs write, but keeping permissions correct is easier with curl/chmod
            execSync(`curl -L ${YT_DLP_URL} -o "${YT_DLP_PATH}"`);
            fs.chmodSync(YT_DLP_PATH, 0o755);
            console.log('[Setup] yt-dlp downloaded and made executable.');
        } catch (error) {
            console.error('[Setup] Failed to download yt-dlp:', error);
            process.exit(1);
        }
    } else {
        console.log('[Setup] yt-dlp found locally.');
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
}

setup().catch(err => {
    console.error(err);
    process.exit(1);
});
