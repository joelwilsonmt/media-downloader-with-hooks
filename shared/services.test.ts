import { describe, expect, it } from 'vitest';
import { detect, formatsFor, parseUrl, playlistOf } from './services';

describe('parseUrl', () => {
  it('adds https to bare hosts', () => {
    expect(parseUrl('youtu.be/abc123')?.href).toBe('https://youtu.be/abc123');
  });
  it('rejects words and non-http schemes', () => {
    expect(parseUrl('hello')).toBeNull();
    expect(parseUrl('javascript:alert(1)')).toBeNull();
    expect(parseUrl('')).toBeNull();
  });
});

describe('detect', () => {
  const cases: [string, string, boolean | null][] = [
    ['https://www.youtube.com/watch?v=jNQXAC9IVRw', 'youtube', false],
    [
      'https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PL123',
      'youtube',
      false,
    ],
    ['https://www.youtube.com/playlist?list=PL123', 'youtube', true],
    ['https://youtube.com/@someone', 'youtube', true],
    ['https://youtu.be/jNQXAC9IVRw', 'youtube', false],
    ['https://youtube.com/shorts/abcdefghijk', 'youtube', false],
    ['https://music.youtube.com/watch?v=abcdefghijk', 'youtube-music', false],
    ['https://www.tiktok.com/@user/video/7234567890123456789', 'tiktok', false],
    ['https://soundcloud.com/artist/track-name', 'soundcloud', false],
    ['https://soundcloud.com/artist/sets/an-album', 'soundcloud', true],
    ['https://on.soundcloud.com/AbCd', 'soundcloud', false],
    [
      'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
      'spotify',
      true,
    ],
    [
      'https://open.spotify.com/intl-de/album/4m2880jivSbbyEGAKfITCa',
      'spotify',
      true,
    ],
    ['https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT', 'spotify', false],
    ['https://music.apple.com/us/album/ram/617154241', 'apple-music', true],
    [
      'https://music.apple.com/us/album/ram/617154241?i=617154353',
      'apple-music',
      false,
    ],
    [
      'https://music.apple.com/us/playlist/todays-hits/pl.f4d1',
      'apple-music',
      true,
    ],
    ['https://vimeo.com/76979871', 'vimeo', false],
    ['https://www.reddit.com/r/videos/comments/abc/title/', 'reddit', null],
    ['https://x.com/user/status/123', 'x', null],
    ['https://www.twitch.tv/videos/123', 'twitch', false],
    ['https://artist.bandcamp.com/album/name', 'bandcamp', true],
    ['https://artist.bandcamp.com/track/name', 'bandcamp', false],
    ['https://www.mixcloud.com/dj/a-set/', 'mixcloud', false],
    ['https://example.com/video', 'generic', null],
  ];
  it.each(cases)('%s -> %s', (url, id, collection) => {
    const d = detect(url);
    expect(d?.service.id).toBe(id);
    expect(d?.collection).toBe(collection);
  });

  it('builds embeds', () => {
    expect(
      detect('https://youtu.be/jNQXAC9IVRw')?.service.embed?.(
        new URL('https://youtu.be/jNQXAC9IVRw')
      )?.src
    ).toBe('https://www.youtube-nocookie.com/embed/jNQXAC9IVRw');
    const sp = detect(
      'https://open.spotify.com/intl-de/track/4cOdK2wGLETKBW3PvgPWqT'
    )!;
    expect(sp.service.embed?.(sp.url)).toEqual({
      src: 'https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT',
      height: 152,
    });
  });

  it('offers no video format for audio-only sources', () => {
    expect(formatsFor(detect('https://soundcloud.com/a/b')!.service)).toEqual([
      'mp3',
      'wav',
    ]);
    expect(formatsFor(detect('https://vimeo.com/1')!.service)).toEqual([
      'mp4',
      'mp3',
      'wav',
    ]);
  });
});

describe('playlistOf', () => {
  it('finds the playlist behind a video link', () => {
    expect(
      playlistOf(
        new URL(
          'https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PL123&index=4'
        )
      )
    ).toBe('https://www.youtube.com/playlist?list=PL123');
    expect(playlistOf(new URL('https://youtu.be/jNQXAC9IVRw?list=PL123'))).toBe(
      'https://www.youtube.com/playlist?list=PL123'
    );
    expect(
      playlistOf(
        new URL('https://music.youtube.com/watch?v=abcdefghijk&list=OLAK5')
      )
    ).toBe('https://music.youtube.com/playlist?list=OLAK5');
  });
  it('ignores plain videos, playlist pages and other sites', () => {
    expect(
      playlistOf(new URL('https://www.youtube.com/watch?v=jNQXAC9IVRw'))
    ).toBeNull();
    expect(
      playlistOf(new URL('https://www.youtube.com/playlist?list=PL123'))
    ).toBeNull();
    expect(
      playlistOf(new URL('https://example.com/watch?v=x&list=y'))
    ).toBeNull();
  });
});
