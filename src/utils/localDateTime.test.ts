import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toLocalDate, toLocalStamp } from './localDateTime';

describe('localDateTime', () => {
  beforeEach(() => vi.stubEnv('TZ', 'Asia/Tokyo'));
  afterEach(() => vi.unstubAllEnvs());

  it('converts a UTC updatedAt to Japan time, including across midnight', () => {
    expect(toLocalStamp('2026-10-19T01:27:34.363Z')).toBe('2026-10-19-102734');
    expect(toLocalDate('2026-10-18T16:30:00.000Z')).toBe('2026-10-19');
    expect(toLocalStamp('2026-10-18T16:30:00.000Z')).toBe('2026-10-19-013000');
  });

  it('leaves thinkid-style local stamps as they are', () => {
    expect(toLocalDate('2026-10-19-102734')).toBe('2026-10-19');
    expect(toLocalStamp('2026-10-19-102734')).toBe('2026-10-19-102734');
    expect(toLocalStamp('')).toBe('');
  });
});
