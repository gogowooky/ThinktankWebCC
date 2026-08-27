/**
 * deviceInfo.ts
 * 表示デバイスの判定と、狭幅デバイス向けの既定表示の適用。
 * iPhone ではサイドパネルが実質使えず、折り返し無しだと横スクロールが多発するため、
 * 簡易レイアウト・WordWrap を既定として強制する。
 */

/** iPhone / iPod（iOS の狭幅デバイス）で表示されているか。iPad は対象外。 */
export function isIPhone(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPod/.test(navigator.userAgent);
}

/**
 * レンダリング前に呼ぶ。iPhone の場合、初回描画からサイドパネルが出ないよう
 * レイアウトモードの localStorage を簡易表示に先行設定する。
 * （保存済み UI 状態による上書きは App 側で再適用してカバーする）
 */
export function seedMobileDisplayDefaults(): void {
  if (!isIPhone()) return;
  try {
    if (localStorage.getItem('tt-layout-mode') !== 'simple') {
      localStorage.setItem('tt-layout-mode', 'simple');
    }
  } catch {
    // プライベートブラウズ等で localStorage が使えない場合は無視
  }
}
