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
  private listeners         = new Set<StatusListener>();

  get isListening(): boolean { return this.listening; }

  /** listening状態の変化を購読する。戻り値の関数で解除する。 */
  onStatusChange(fn: StatusListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn(this.listening);
  }

  /**
   * 音声入力を開始する。対象は指定エディタ（省略時は現在フォーカス中のエディタ）で、
   * 現在のカーソル位置から認識結果を挿入していく。
   * 既に音声入力中の場合は何もしない（多重開始防止）。
   */
  start(editor?: MonacoEditor.IStandaloneCodeEditor): boolean {
    if (this.listening) return true;

    const Ctor = getSpeechWindow().SpeechRecognition ?? getSpeechWindow().webkitSpeechRecognition;
    if (!Ctor) return false;

    const target = editor ?? (TTShortcutManager.instance.activeEditor as MonacoEditor.IStandaloneCodeEditor | null);
    if (!target) return false;

    const model = target.getModel();
    const pos = target.getPosition();
    if (!model || !pos) return false;

    this.targetEditor = target;
    this.insertStartOffset = model.getOffsetAt(pos);
    this.insertedLength = 0;

    const recognition = new Ctor();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalText = '';

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) finalText += transcript;
        else interim += transcript;
      }
      this.replaceInsertedText(finalText + interim);
    };
    recognition.onerror = (event) => {
      console.error('[TTVoiceInput] 音声認識エラー:', event.error);
      this.listening = false;
      this.notify();
    };
    recognition.onend = () => {
      this.listening = false;
      this.notify();
    };

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
