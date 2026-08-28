/**
 * TTVoiceInput.ts
 * ブラウザの音声入力（Web Speech API）で、フォーカス中の TextEditor へ
 * 認識結果をリアルタイムに挿入するシングルトン。
 *
 * SpeechRecognition はまだ標準化途上のAPIで TypeScript の lib.dom.d.ts に
 * 型定義が無いため、ここで実際に使う範囲だけ最小限の型を独自に宣言する。
 */
import type { editor as MonacoEditor, IRange } from 'monaco-editor';
import { TTShortcutManager } from './TTShortcutManager';

// ── Web Speech API 最小型定義 ────────────────────────────────────────────

interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onspeechstart: (() => void) | null;
}

interface SpeechRecognitionCtorLike {
  new (): SpeechRecognitionLike;
}

interface SpeechWindow {
  SpeechRecognition?: SpeechRecognitionCtorLike;
  webkitSpeechRecognition?: SpeechRecognitionCtorLike;
}

function getSpeechWindow(): SpeechWindow {
  return window as unknown as SpeechWindow;
}

/** このブラウザで音声入力（SpeechRecognition）が使えるかどうか */
export function isVoiceInputSupported(): boolean {
  const w = getSpeechWindow();
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

type StatusListener = (listening: boolean) => void;
type ErrorListener = (message: string | null) => void;

/**
 * SpeechRecognition の error コードを日本語の説明文に変換する。
 * ユーザー操作による中止（aborted）はエラー表示しないため null を返す。
 */
function describeSpeechError(code: string): string | null {
  switch (code) {
    case 'not-allowed':
    case 'permission-denied':
      return 'マイクの使用が許可されていません（ブラウザ・OSの設定でマイクへのアクセスを許可してください）';
    case 'audio-capture':
      return 'マイクを利用できません（マイクが接続されているか確認してください）';
    case 'no-speech':
      return '音声が検出されませんでした';
    case 'network':
      return '音声認識サービスに接続できませんでした（Electron版はGoogleの音声認識サービスに未対応の場合があります。ブラウザ版でお試しください）';
    case 'service-not-allowed':
      return '音声認識サービスを利用できません';
    case 'aborted':
      return null;
    default:
      return `音声認識エラー: ${code}`;
  }
}

export class TTVoiceInput {
  private static _instance: TTVoiceInput | null = null;
  static get instance(): TTVoiceInput {
    if (!TTVoiceInput._instance) TTVoiceInput._instance = new TTVoiceInput();
    return TTVoiceInput._instance;
  }
  private constructor() {}

  private recognition:      SpeechRecognitionLike | null = null;
  private targetEditor:     MonacoEditor.IStandaloneCodeEditor | null = null;
  private insertStartOffset = 0;
  private insertedLength    = 0;
  private listening         = false;
  private errorMessage:     string | null = null;
  private listeners         = new Set<StatusListener>();
  private errorListeners    = new Set<ErrorListener>();

  get isListening(): boolean { return this.listening; }
  get lastError(): string | null { return this.errorMessage; }

  /** listening状態の変化を購読する。戻り値の関数で解除する。 */
  onStatusChange(fn: StatusListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** エラーメッセージの変化を購読する（null = エラー解消）。戻り値の関数で解除する。 */
  onErrorChange(fn: ErrorListener): () => void {
    this.errorListeners.add(fn);
    return () => this.errorListeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn(this.listening);
  }

  private setError(message: string | null): void {
    this.errorMessage = message;
    for (const fn of this.errorListeners) fn(message);
  }

  /**
   * 音声入力を開始する。対象は指定エディタ（省略時は現在フォーカス中のエディタ）で、
   * 現在のカーソル位置から認識結果を挿入していく。
   * 既に音声入力中の場合は何もしない（多重開始防止）。
   * 開始できなかった場合は lastError / onErrorChange で理由を確認できる。
   */
  start(editor?: MonacoEditor.IStandaloneCodeEditor): boolean {
    if (this.listening) return true;

    const Ctor = getSpeechWindow().SpeechRecognition ?? getSpeechWindow().webkitSpeechRecognition;
    if (!Ctor) {
      this.setError('このブラウザは音声入力に対応していません');
      return false;
    }

    const target = editor ?? (TTShortcutManager.instance.activeEditor as MonacoEditor.IStandaloneCodeEditor | null);
    if (!target) {
      this.setError('音声入力の対象となるテキストエディタが見つかりません。編集したいメモをクリックしてフォーカスしてから実行してください。');
      return false;
    }

    const model = target.getModel();
    const pos = target.getPosition();
    if (!model || !pos) {
      this.setError('音声入力の対象となるテキストエディタが見つかりません。編集したいメモをクリックしてフォーカスしてから実行してください。');
      return false;
    }

    this.setError(null);
    this.targetEditor = target;
    this.insertStartOffset = model.getOffsetAt(pos);
    this.insertedLength = 0;

    const recognition = new Ctor();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalText = '';

    recognition.onresult = (event) => {
      try {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0]?.transcript ?? '';
          if (result.isFinal) finalText += transcript;
          else interim += transcript;
        }
        console.log('[TTVoiceInput] onresult:', { resultIndex: event.resultIndex, finalText, interim });
        this.replaceInsertedText(finalText + interim);
      } catch (err) {
        console.error('[TTVoiceInput] onresult内でエラー:', err);
        this.setError(`テキスト挿入でエラーが発生しました: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    recognition.onerror = (event) => {
      console.error('[TTVoiceInput] 音声認識エラー:', event.error);
      const message = describeSpeechError(event.error);
      if (message) this.setError(message);
      this.listening = false;
      this.notify();
    };
    recognition.onend = () => {
      console.log('[TTVoiceInput] onend（音声認識セッション終了）');
      this.listening = false;
      this.notify();
    };
    recognition.onstart = () => console.log('[TTVoiceInput] onstart（セッション開始）');
    recognition.onaudiostart = () => console.log('[TTVoiceInput] onaudiostart（マイク音声のキャプチャ開始）');
    recognition.onspeechstart = () => console.log('[TTVoiceInput] onspeechstart（発話を検出）');

    console.log('[TTVoiceInput] start: 音声認識を開始します', { targetLine: pos.lineNumber, targetColumn: pos.column });
    this.recognition = recognition;
    recognition.start();
    this.listening = true;
    this.notify();
    return true;
  }

  /** 音声入力を停止する（挿入済みのテキストはそのまま残す） */
  stop(): void {
    this.recognition?.stop();
  }

  /** 音声入力を中止し、このセッションで挿入したテキストを取り消す */
  cancel(): void {
    if (this.recognition) {
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
      this.recognition.onstart = null;
      this.recognition.onaudiostart = null;
      this.recognition.onspeechstart = null;
      this.recognition.abort();
      this.recognition = null;
    }
    if (this.targetEditor && this.insertedLength > 0) {
      this.replaceInsertedText('');
    }
    this.targetEditor = null;
    this.insertedLength = 0;
    if (this.listening) {
      this.listening = false;
      this.notify();
    }
  }

  /** このセッションで挿入した範囲（insertStartOffset 〜 +insertedLength）を text に置き換える */
  private replaceInsertedText(text: string): void {
    const editor = this.targetEditor;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    const startPos = model.getPositionAt(this.insertStartOffset);
    const endPos = model.getPositionAt(this.insertStartOffset + this.insertedLength);
    const range: IRange = {
      startLineNumber: startPos.lineNumber,
      startColumn:     startPos.column,
      endLineNumber:   endPos.lineNumber,
      endColumn:       endPos.column,
    };
    editor.executeEdits('voice-input', [{ range, text, forceMoveMarkers: true }]);
    this.insertedLength = text.length;

    const newEndPos = model.getPositionAt(this.insertStartOffset + this.insertedLength);
    editor.setPosition(newEndPos);
    editor.revealPositionInCenterIfOutsideViewport(newEndPos);
  }
}
