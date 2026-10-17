/** HTTPエラーがHTMLや空本文でも、各機能が用意した復旧メッセージを失わない。 */
export async function readApiJson(
  response: Response,
  errorMessage = '通信に失敗しました。',
  { useServerError = true }: { useServerError?: boolean } = {},
): Promise<unknown> {
  if (!response.ok) {
    const value: unknown = useServerError ? await response.json().catch(() => null) : null;
    const message = value && typeof value === 'object' && 'error' in value && typeof value.error === 'string'
      ? value.error : errorMessage;
    throw new Error(message);
  }
  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error(errorMessage);
  }
  return response.json();
}
