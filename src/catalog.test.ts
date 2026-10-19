import { describe, expect, it } from 'vitest';
import { parseApplePage, searchQuery, trackLabel } from './catalog';

// Shape mirrors music.apple.com's serialized-server-data (trimmed).
const page = (sections: unknown[]) =>
  `<html><script type="application/json" id="serialized-server-data">${JSON.stringify(
    {
      data: [{ intent: {}, data: { sections } }],
    }
  )}</script></html>`;

const header = {
  itemKind: 'containerDetailHeaderLockup',
  items: [
    {
      title: 'Random Access Memories',
      subtitleLinks: [{ title: 'Daft Punk' }],
      artwork: { dictionary: { url: 'https://img/{w}x{h}bb.{f}' } },
    },
  ],
};
const tracks = {
  itemKind: 'trackLockup',
  items: [
    {
      title: 'Give Life Back to Music',
      artistName: 'Daft Punk',
      contentDescriptor: { identifiers: { storeAdamID: '1' } },
    },
    {
      title: 'Get Lucky',
      artistName: 'Daft Punk',
      contentDescriptor: { identifiers: { storeAdamID: '2' } },
    },
  ],
};

describe('parseApplePage', () => {
  it('reads an album', () => {
    const r = parseApplePage(
      page([header, tracks]),
      'https://music.apple.com/us/album/x/9'
    );
    expect(r.title).toBe('Random Access Memories');
    expect(r.thumbnail).toBe('https://img/600x600bb.jpg');
    expect(r.tracks).toHaveLength(2);
  });
  it('picks one song from an album link with ?i=', () => {
    const r = parseApplePage(
      page([header, tracks]),
      'https://music.apple.com/us/album/x/9?i=2'
    );
    expect(r.tracks).toEqual([{ title: 'Get Lucky', artist: 'Daft Punk' }]);
    expect(r.title).toBe('Get Lucky');
  });
  it('falls back to JSON-LD on song pages', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'MusicComposition',
      name: 'Get Lucky',
      audio: { byArtist: [{ name: 'Daft Punk' }] },
    })}</script>`;
    expect(
      parseApplePage(html, 'https://music.apple.com/us/song/get-lucky/2').tracks
    ).toEqual([{ title: 'Get Lucky', artist: 'Daft Punk' }]);
  });
  it('throws when nothing is found', () => {
    expect(() =>
      parseApplePage('<html></html>', 'https://music.apple.com/x')
    ).toThrow(/no track list/);
  });
});

describe('track naming', () => {
  it('searches SoundCloud by artist and title', () => {
    const t = { title: 'Get Lucky', artist: 'Daft Punk' };
    expect(searchQuery(t)).toBe('scsearch5:Daft Punk - Get Lucky');
    expect(trackLabel(t)).toBe('Get Lucky - Daft Punk');
  });
});
