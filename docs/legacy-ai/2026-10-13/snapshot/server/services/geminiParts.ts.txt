/** SDKの集約処理で欠落させず、署名と呼び出しIDを次のターンへ渡す。 */
export interface GeminiResponsePart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name: string; args: object; id?: string };
}

export function collectGeminiParts(parts: GeminiResponsePart[]) {
  return {
    modelParts: parts,
    text: parts.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join(''),
    functionCalls: parts.flatMap(p => p.functionCall ? [{ ...p.functionCall, args: { ...p.functionCall.args } }] : []),
  };
}

export function geminiFunctionResponse(
  call: NonNullable<GeminiResponsePart['functionCall']>, response: Record<string, unknown>,
) {
  return { functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response } };
}
