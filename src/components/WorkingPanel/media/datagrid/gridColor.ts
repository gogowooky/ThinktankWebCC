

export const COLOR_REGEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

export function isColorValue(v: string): boolean { return COLOR_REGEX.test(v.trim()); }

export function hexToHsv(hex: string): { h: number; s: number; v: number; a: number; } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const a = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max, a };
}

export function hsvToHex(h: number, s: number, v: number, a = 1, withAlpha = false): string {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  const x2 = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${x2(f(5))}${x2(f(3))}${x2(f(1))}${withAlpha ? x2(a) : ''}`;
}
