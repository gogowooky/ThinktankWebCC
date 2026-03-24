/**
 * AIApiService.ts
 * Phase 12 段260: クライアント側AIAPI呼び出しラッパー
 *
 * サーバーの /api/ai/complete エンドポイントを通じてAIに1ターンの
 * プロンプトを送信する。Facilitatorエンジン群が共用する。
 */

export interface AICompleteOptions {
    system?: string;
    user: string;
}

export class AIApiService {
    /**
     * 1ターンのAI補完を実行する
     * オフライン時またはAPI失敗時は null を返す（エラーにしない）
     */
    public async complete(options: AICompleteOptions): Promise<string | null> {
        try {
            const response = await fetch('/api/ai/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ system: options.system, user: options.user }),
            });

            if (!response.ok) {
                console.warn(`[AIApiService] API失敗: ${response.status}`);
                return null;
            }

            const data = await response.json();
            return data.reply as string || null;
        } catch (e) {
            // オフライン時やネットワークエラー時はnullを返してスキップ
            console.warn('[AIApiService] AI補完スキップ（オフライン/エラー）:', e);
            return null;
        }
    }
}
