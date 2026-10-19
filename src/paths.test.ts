import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  contentDisposition,
  folderSegments,
  literalTemplate,
  resolveUnder,
} from './paths';

describe('resolveUnder', () => {
  const root = '/data/audio';
  it('keeps nested folders', () => {
    expect(resolveUnder(root, 'Lo-fi/Night')).toBe(
      path.join(root, 'Lo-fi', 'Night')
    );
  });
  it('drops traversal segments', () => {
    expect(resolveUnder(root, '../../etc')).toBe(path.join(root, 'etc'));
    expect(resolveUnder(root, '/abs/path')).toBe(
      path.join(root, 'abs', 'path')
    );
    expect(resolveUnder(root, '..\\..\\x')).toBe(path.join(root, 'x'));
  });
  it('returns the root for empty input', () => {
    expect(resolveUnder(root, '')).toBe(root);
    expect(resolveUnder(root, ' / ')).toBe(root);
  });
});

describe('folderSegments', () => {
  it('strips unsafe characters and leading dots', () => {
    expect(folderSegments('My: Mix?/.hidden')).toEqual(['My- Mix-', 'hidden']);
  });
});

describe('literalTemplate', () => {
  it('escapes yt-dlp template markers', () => {
    expect(literalTemplate('100% Hits / Vol 1')).toBe('100%% Hits - Vol 1');
  });
});

describe('contentDisposition', () => {
  it('encodes non-ASCII names', () => {
    expect(contentDisposition('Café "Live".mp3')).toBe(
      `attachment; filename="Caf_ _Live_.mp3"; filename*=UTF-8''Caf%C3%A9%20%22Live%22.mp3`
    );
  });
});
