const PREFIX = '<!-- thinktank-metadata-v1:';
/** Compatibility envelope for the separate C# API, which has no metadata column. */
export function packLocalMetadata(body: string, metadata?: Record<string, unknown>) {
  if (!metadata || !Object.keys(metadata).length) return body;
  return `${PREFIX}${encodeURIComponent(JSON.stringify(metadata))} -->\n${body}`;
}
export function unpackLocalMetadata(body: string) {
  if (!body.startsWith(PREFIX)) return { body, metadata: undefined };
  const end = body.indexOf(' -->\n');
  if (end < 0) throw new Error('管理情報の保存形式が壊れています。上書きせず確認してください。');
  const metadata = JSON.parse(decodeURIComponent(body.slice(PREFIX.length, end)));
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('管理情報が不正です。');
  return { body: body.slice(end + 5), metadata: metadata as Record<string, unknown> };
}
