/**
 * TouchGestureRecognizer.ts
 * Pointer Events API を使用したタッチジェスチャー認識モジュール
 *
 * 認識可能なジェスチャー:
 * - TAP1: シングルタップ
 * - TAP2: ダブルタップ
 * - LONGPRESS: 長押し
 * - SWIPE_LEFT / SWIPE_RIGHT / SWIPE_UP / SWIPE_DOWN: スワイプ
 *
 * 各ジェスチャーにはオプションでprefixを付与可能（例: 'PanelTitle_TAP1'）
 */

// ────────────────────────────────────────────────────────────────────────
// 定数
// ────────────────────────────────────────────────────────────────────────

/** ダブルタップ判定の最大間隔 (ms) */
const DOUBLE_TAP_INTERVAL = 300;

/** 長押し判定の保持時間 (ms) */
const LONGPRESS_DURATION = 500;

/** タップ判定の最大移動量 (px) */
const TAP_MOVE_THRESHOLD = 10;

/** スワイプ判定の最小移動量 (px) */
const SWIPE_DISTANCE_THRESHOLD = 50;

// ────────────────────────────────────────────────────────────────────────
// 型定義
// ────────────────────────────────────────────────────────────────────────

/** ジェスチャー認識時のコールバック型 */
export type GestureCallback = (key: string, event: PointerEvent) => void;

/** ジェスチャー認識の設定 */
export interface GestureOptions {
    /** キー文字列のprefix（例: 'PanelTitle_' → 'PanelTitle_TAP1'）*/
    prefix?: string;
    /** スワイプ認識を有効にするか（デフォルト: true）*/
    enableSwipe?: boolean;
    /** 長押し認識を有効にするか（デフォルト: true）*/
    enableLongPress?: boolean;
    /** ダブルタップ認識を有効にするか（デフォルト: true）*/
    enableDoubleTap?: boolean;
}

/** 内部トラッキング情報 */
interface PointerState {
    /** タッチ開始座標X */
    startX: number;
    /** タッチ開始座標Y */
    startY: number;
    /** タッチ開始時刻 */
    startTime: number;
    /** ポインターID */
    pointerId: number;
    /** 長押しタイマー */
    longPressTimer: ReturnType<typeof setTimeout> | null;
    /** 長押しが発火済みか */
    longPressFired: boolean;
}

// ────────────────────────────────────────────────────────────────────────
// TouchGestureRecognizer クラス
// ────────────────────────────────────────────────────────────────────────

/**
 * 指定のDOM要素にタッチジェスチャー認識を提供するクラス。
 * Pointer Events API を使用し、pointerType === 'touch' の場合のみ機能する。
 */
export class TouchGestureRecognizer {
    private element: HTMLElement;
    private callback: GestureCallback;
    private options: Required<GestureOptions>;

    /** 現在のポインターの追跡状態 */
    private pointerState: PointerState | null = null;

    /** ダブルタップ判定用: 前回のタップ座標 */
    private lastTapX: number = 0;
    private lastTapY: number = 0;
    /** ダブルタップ判定用: ダブルタップ待機タイマー */
    private doubleTapTimer: ReturnType<typeof setTimeout> | null = null;
    /** ダブルタップ判定用: 保留中のタップイベント */
    private pendingTapEvent: PointerEvent | null = null;

    // バインド済みイベントハンドラ（removeEventListener用）
    private boundPointerDown: (e: PointerEvent) => void;
    private boundPointerMove: (e: PointerEvent) => void;
    private boundPointerUp: (e: PointerEvent) => void;
    private boundPointerCancel: (e: PointerEvent) => void;
    private boundTouchStart: (e: TouchEvent) => void;

    constructor(element: HTMLElement, callback: GestureCallback, options?: GestureOptions) {
        this.element = element;
        this.callback = callback;
        this.options = {
            prefix: options?.prefix ?? '',
            enableSwipe: options?.enableSwipe ?? true,
            enableLongPress: options?.enableLongPress ?? true,
            enableDoubleTap: options?.enableDoubleTap ?? true,
        };

        // イベントハンドラをバインド
        this.boundPointerDown = this.onPointerDown.bind(this);
        this.boundPointerMove = this.onPointerMove.bind(this);
        this.boundPointerUp = this.onPointerUp.bind(this);
        this.boundPointerCancel = this.onPointerCancel.bind(this);
        this.boundTouchStart = this.onTouchStart.bind(this);

        this.attach();
    }

    /** イベントリスナーを要素にアタッチ */
    private attach(): void {
        this.element.addEventListener('pointerdown', this.boundPointerDown);
        this.element.addEventListener('pointermove', this.boundPointerMove);
        this.element.addEventListener('pointerup', this.boundPointerUp);
        this.element.addEventListener('pointercancel', this.boundPointerCancel);
        // タッチ時のマウスイベントエミュレーションを抑制
        this.element.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    }

    /** イベントリスナーを解除してクリーンアップ */
    public destroy(): void {
        this.element.removeEventListener('pointerdown', this.boundPointerDown);
        this.element.removeEventListener('pointermove', this.boundPointerMove);
        this.element.removeEventListener('pointerup', this.boundPointerUp);
        this.element.removeEventListener('pointercancel', this.boundPointerCancel);
        this.element.removeEventListener('touchstart', this.boundTouchStart);
        this.clearLongPressTimer();
        this.clearDoubleTapTimer();
    }

    // ────────────────────────────────────────────────────────────────
    // イベントハンドラ
    // ────────────────────────────────────────────────────────────────

    /** touchstartでのマウスイベントエミュレーション抑制 */
    private onTouchStart(e: TouchEvent): void {
        // マウスイベント（mousedown/click等）のエミュレーションを抑制
        // ※ これによりタッチ時に onMouseDown が二重発火しなくなる
        e.preventDefault();
    }

    private onPointerDown(e: PointerEvent): void {
        // タッチ入力のみ処理
        if (e.pointerType !== 'touch') return;

        // マルチタッチの場合は最初のタッチのみ追跡
        if (this.pointerState !== null) return;

        this.pointerState = {
            startX: e.clientX,
            startY: e.clientY,
            startTime: Date.now(),
            pointerId: e.pointerId,
            longPressTimer: null,
            longPressFired: false,
        };

        // ポインターキャプチャを設定（要素外での移動・リリースを追跡するため）
        try {
            this.element.setPointerCapture(e.pointerId);
        } catch (_ex) {
            // キャプチャ失敗は無視（一部ブラウザで例外が出ることがある）
        }

        // 長押しタイマーを開始
        if (this.options.enableLongPress) {
            this.pointerState.longPressTimer = setTimeout(() => {
                if (this.pointerState && !this.pointerState.longPressFired) {
                    this.pointerState.longPressFired = true;
                    this.clearDoubleTapTimer(); // ダブルタップ判定をキャンセル
                    const key = this.options.prefix + 'LONGPRESS';
                    console.log(`[TouchGesture] ${key} at (${e.clientX}, ${e.clientY})`);
                    this.callback(key, e);
                }
            }, LONGPRESS_DURATION);
        }
    }

    private onPointerMove(e: PointerEvent): void {
        if (e.pointerType !== 'touch') return;
        if (!this.pointerState || this.pointerState.pointerId !== e.pointerId) return;

        const dx = e.clientX - this.pointerState.startX;
        const dy = e.clientY - this.pointerState.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 移動量がタップ閾値を超えたら長押しタイマーをキャンセル
        if (dist > TAP_MOVE_THRESHOLD) {
            this.clearLongPressTimer();
        }
    }

    private onPointerUp(e: PointerEvent): void {
        if (e.pointerType !== 'touch') return;
        if (!this.pointerState || this.pointerState.pointerId !== e.pointerId) return;

        const state = this.pointerState;
        this.pointerState = null;
        this.clearLongPressTimer();

        // ポインターキャプチャ解放
        try {
            this.element.releasePointerCapture(e.pointerId);
        } catch (_ex) { /* 無視 */ }

        // 長押しが発火済みならタップ/スワイプ判定はスキップ
        if (state.longPressFired) return;

        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const elapsed = Date.now() - state.startTime;

        // ─── スワイプ判定 ───
        if (this.options.enableSwipe && dist >= SWIPE_DISTANCE_THRESHOLD) {
            let direction: string;
            if (absDx > absDy) {
                // 水平スワイプ
                direction = dx > 0 ? 'SWIPE_RIGHT' : 'SWIPE_LEFT';
            } else {
                // 垂直スワイプ
                direction = dy > 0 ? 'SWIPE_DOWN' : 'SWIPE_UP';
            }
            const key = this.options.prefix + direction;
            console.log(`[TouchGesture] ${key} (dist=${dist.toFixed(0)}px, ${elapsed}ms)`);
            this.callback(key, e);
            this.clearDoubleTapTimer(); // スワイプ後はダブルタップ判定をクリア
            return;
        }

        // ─── タップ判定 ───
        if (dist <= TAP_MOVE_THRESHOLD && elapsed < LONGPRESS_DURATION) {
            if (this.options.enableDoubleTap) {
                // ダブルタップ判定: 前回のタップとの間隔と距離をチェック
                if (this.doubleTapTimer !== null) {
                    // ダブルタップ検出
                    const tapDist = Math.sqrt(
                        Math.pow(e.clientX - this.lastTapX, 2) +
                        Math.pow(e.clientY - this.lastTapY, 2)
                    );
                    if (tapDist <= TAP_MOVE_THRESHOLD * 3) {
                        // ダブルタップ確定
                        this.clearDoubleTapTimer();
                        const key = this.options.prefix + 'TAP2';
                        console.log(`[TouchGesture] ${key} at (${e.clientX}, ${e.clientY})`);
                        this.callback(key, e);
                        return;
                    }
                }

                // シングルタップの保留（ダブルタップ待ち）
                this.clearDoubleTapTimer();
                this.lastTapX = e.clientX;
                this.lastTapY = e.clientY;
                this.pendingTapEvent = e;

                this.doubleTapTimer = setTimeout(() => {
                    // ダブルタップ待機時間内に2回目のタップがなかった → シングルタップ確定
                    this.doubleTapTimer = null;
                    const key = this.options.prefix + 'TAP1';
                    console.log(`[TouchGesture] ${key} at (${e.clientX}, ${e.clientY})`);
                    if (this.pendingTapEvent) {
                        this.callback(key, this.pendingTapEvent);
                        this.pendingTapEvent = null;
                    }
                }, DOUBLE_TAP_INTERVAL);
            } else {
                // ダブルタップ無効の場合は即座にTAP1
                const key = this.options.prefix + 'TAP1';
                console.log(`[TouchGesture] ${key} at (${e.clientX}, ${e.clientY})`);
                this.callback(key, e);
            }
        }
    }

    private onPointerCancel(e: PointerEvent): void {
        if (e.pointerType !== 'touch') return;
        if (!this.pointerState || this.pointerState.pointerId !== e.pointerId) return;

        this.clearLongPressTimer();
        this.pointerState = null;

        try {
            this.element.releasePointerCapture(e.pointerId);
        } catch (_ex) { /* 無視 */ }
    }

    // ────────────────────────────────────────────────────────────────
    // ユーティリティ
    // ────────────────────────────────────────────────────────────────

    private clearLongPressTimer(): void {
        if (this.pointerState?.longPressTimer) {
            clearTimeout(this.pointerState.longPressTimer);
            this.pointerState.longPressTimer = null;
        }
    }

    private clearDoubleTapTimer(): void {
        if (this.doubleTapTimer !== null) {
            clearTimeout(this.doubleTapTimer);
            this.doubleTapTimer = null;
            this.pendingTapEvent = null;
        }
    }
}

// ────────────────────────────────────────────────────────────────────────
// ヘルパー関数
// ────────────────────────────────────────────────────────────────────────

/**
 * DOM要素にタッチジェスチャー認識をアタッチするヘルパー関数。
 * UIRequestTriggeredAction への統合を簡略化する。
 *
 * @param element アタッチ対象のDOM要素
 * @param prefix キー文字列のprefix（例: 'PanelTitle_'）
 * @param onGesture ジェスチャー検出時のコールバック (key, event) => void
 * @param options 追加オプション
 * @returns destroy関数（クリーンアップ用）
 */
export function attachTouchGesture(
    element: HTMLElement,
    prefix: string,
    onGesture: GestureCallback,
    options?: Omit<GestureOptions, 'prefix'>
): () => void {
    const recognizer = new TouchGestureRecognizer(element, onGesture, {
        ...options,
        prefix,
    });
    return () => recognizer.destroy();
}

/**
 * 現在のデバイスがタッチ入力をサポートしているかを判定する。
 * @returns タッチデバイスの場合 true
 */
export function isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}
