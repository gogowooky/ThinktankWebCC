import { describe, it, expect } from 'vitest';
import { isBlockedIp, assertPublicHttpUrl } from './ssrfGuard';

describe('isBlockedIp', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // GCP/AWS メタデータ
    '100.64.0.1', // CGN
    '0.0.0.0',
    '224.0.0.1', // マルチキャスト
    '::1',
    'fe80::1', // link-local
    'fd00::1', // ULA
    '::ffff:127.0.0.1', // IPv4-mapped loopback
    'not-an-ip',
  ])('%s はブロックする', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34', // example.com
    '172.15.255.255', // 172.16/12 の直前
    '172.32.0.1', // 172.16/12 の直後
    '2606:4700:4700::1111', // Cloudflare DNS v6
  ])('%s は許可する', (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });
});

describe('assertPublicHttpUrl', () => {
  it('http/https 以外を拒否する', async () => {
    await expect(assertPublicHttpUrl('ftp://example.com')).rejects.toThrow(/http\/https/);
    await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toThrow();
  });

  it('不正な URL を拒否する', async () => {
    await expect(assertPublicHttpUrl('not a url')).rejects.toThrow(/形式/);
  });

  it('IP リテラルのプライベート宛先を拒否する', async () => {
    await expect(assertPublicHttpUrl('http://169.254.169.254/computeMetadata/v1/')).rejects.toThrow(
      /プライベート/,
    );
    await expect(assertPublicHttpUrl('http://127.0.0.1:8080/')).rejects.toThrow(/プライベート/);
    await expect(assertPublicHttpUrl('http://[::1]/')).rejects.toThrow(/プライベート/);
  });

  it('解決できないホストを拒否する', async () => {
    await expect(
      assertPublicHttpUrl('http://no-such-host.invalid/'),
    ).rejects.toThrow(/解決/);
  });

  it('公開ホストは URL を返す', async () => {
    const u = await assertPublicHttpUrl('https://example.com/path?q=1');
    expect(u.hostname).toBe('example.com');
  });
});
