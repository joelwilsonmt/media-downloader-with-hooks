import { describe, expect, it } from 'vitest';
import {
  downloadArgs,
  flatEntries,
  friendlyError,
  parseLine,
  succeeded,
} from './ytdlp';

describe('parseLine', () => {
  it('reads progress with an estimated total', () => {
    expect(parseLine('PROGRESS 500 NA 1000 2048.5 3')).toEqual({
      type: 'progress',
      progress: {
        downloadedBytes: 500,
        totalBytes: 1000,
        speed: 2048.5,
        eta: 3,
        percent: 50,
      },
    });
  });
  it('maps post-processor stages and ignores finishes', () => {
    expect(parseLine('STAGE ExtractAudio started')).toEqual({
      type: 'stage',
      stage: 'Converting audio',
    });
    expect(parseLine('STAGE ExtractAudio finished')).toBeNull();
    expect(parseLine('STAGE MoveFiles started')).toBeNull();
  });
  it('captures the final path whatever the extension', () => {
    expect(parseLine('FILE:/data/videos/Clip.webm')).toEqual({
      type: 'file',
      path: '/data/videos/Clip.webm',
    });
  });
});

describe('downloadArgs', () => {
  it('adds a trim range and suffix', () => {
    const args = downloadArgs({
      url: 'https://youtu.be/x',
      format: 'mp3',
      outputDir: '/out',
      tempDir: '/tmp/w',
      trim: { start: 65, end: 3725 },
    });
    expect(args).toContain('*00:01:05-01:02:05');
    expect(args[args.indexOf('-o') + 1]).toBe(
      '%(title).180B (1m5s-1h2m5s).%(ext)s'
    );
    expect(args.at(-1)).toBe('https://youtu.be/x');
  });
  it('uses a literal name when renaming', () => {
    const args = downloadArgs({
      url: 'u',
      format: 'wav',
      outputDir: '/o',
      tempDir: '/t',
      name: 'Song - Artist',
    });
    expect(args[args.indexOf('-o') + 1]).toBe('Song - Artist.%(ext)s');
    expect(args).not.toContain('--embed-thumbnail');
  });
});

describe('search downloads', () => {
  it('stop after the first result that downloads', () => {
    const args = downloadArgs({
      url: 'scsearch5:a - b',
      format: 'mp3',
      outputDir: '/o',
      tempDir: '/t',
    });
    expect(args).toEqual(
      expect.arrayContaining(['--max-downloads', '1', '--ignore-errors'])
    );
    expect(succeeded(101, 'scsearch5:a - b')).toBe(true);
    expect(succeeded(101, 'https://youtu.be/x')).toBe(false);
  });
});

describe('flatEntries', () => {
  it('builds URLs for id-only entries', () => {
    expect(
      flatEntries(
        [{ id: 'abc', title: 'A', ie_key: 'Youtube' }, { title: 'none' }],
        'https://youtube.com/playlist?list=x'
      )
    ).toEqual([{ url: 'https://www.youtube.com/watch?v=abc', title: 'A' }]);
  });
});

describe('friendlyError', () => {
  it('explains age restriction', () => {
    expect(friendlyError('ERROR: Sign in to confirm your age', 'x')).toMatch(
      /age-restricted/
    );
  });
  it('falls back', () => {
    expect(friendlyError('weird', 'Download failed.')).toBe('Download failed.');
  });
});
