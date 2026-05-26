# Phase 22: クロスプラットフォーム（ネイティブモバイル・Apple Watch） ☆新規

## 前提条件
- Phase 21（クイックキャプチャ）が完了していること
- バックエンドAPIが本番環境で安定稼働していること
- `/api/capture` 統一エンドポイントが利用可能なこと

## このフェーズの目標
PWAに加えて、ネイティブモバイルアプリとApple Watchアプリを構築し、
あらゆるデバイスからの入力・閲覧を実現する。

> **注意**: このフェーズは開発コストが最も大きい。
> PWA（Phase 12）で十分な場合はスキップ可能。
> 実際のニーズに基づいて段階的に実装すること。

---

## 段340: 技術選定

### モバイルアプリ

既存のReact SPAの資産を最大限活用するため、以下を推奨:

| 選択肢 | メリット | デメリット | 推奨度 |
|---|---|---|---|
| **Capacitor** | 既存React SPAをそのまま利用、Web技術のみ | ネイティブ性能は劣る | ★★★（最推奨） |
| React Native | ネイティブUI、高性能 | UIコンポーネント再実装が必要 | ★★ |
| Flutter | 高品質UI、1コードベース | Dart学習、全面再実装 | ★ |

> **推奨**: Capacitorで開始し、パフォーマンス問題が顕在化した場合にReact Nativeへ移行

### Apple Watch

| 選択肢 | 内容 |
|---|---|
| **WatchOS + WatchConnectivity** | Swift/SwiftUIで音声入力＋テキスト送信のコンパニオンアプリ |
| Web API直接呼出 | watchOS 10以降のURLSession対応で直接APIコール |

---

## 段341: Capacitorプロジェクト初期化

```bash
npm install @capacitor/core @capacitor/cli
npx cap init "TT Stand" "com.ttstand.app"
npx cap add ios
npx cap add android
```

`capacitor.config.ts`:
```typescript
const config: CapacitorConfig = {
  appId: 'com.ttstand.app',
  appName: 'TT Stand',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // 開発中はローカルサーバーを参照
    // url: 'http://192.168.x.x:5173'
  },
  plugins: {
    SplashScreen: { launchAutoHide: true },
    Keyboard: { resize: 'body' },
    StatusBar: { style: 'dark' }
  }
};
```

---

## 段342: モバイル専用キャプチャ機能

Capacitorプラグインを使ったネイティブ機能:

```bash
npm install @capacitor/camera @capacitor/geolocation @capacitor/share
npm install @capacitor/filesystem @capacitor/haptics
```

```typescript
// src/services/mobile/MobileCaptureService.ts
import { Camera, CameraResultType } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';

export class MobileCaptureService {
  // カメラで写真撮影 → TTEntry保存
  async capturePhoto(): Promise<TTEntry> {
    const photo = await Camera.getPhoto({
      quality: 80,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera
    });
    // → image エントリー作成
  }

  // 現在位置取得 → TTEntry保存
  async captureLocation(note?: string): Promise<TTEntry> {
    const pos = await Geolocation.getCurrentPosition();
    // → location エントリー作成
  }

  // 音声録音 → 文字起こし → TTEntry保存
  async captureVoice(): Promise<TTEntry> {
    // AudioRecorder + SpeechRecognition 統合
  }
}
```

---

## 段343: モバイル用簡易UIモード

モバイルアプリ起動時のデフォルトUIを、フルThinktank UIではなく簡易キャプチャUIにするオプション:

```typescript
// src/components/Mobile/QuickCaptureView.tsx
// 大きなボタン4つ: 📝テキスト | 📷写真 | 🎤音声 | 📍位置
// ワンタップで即座にキャプチャ開始
// 詳細編集が必要な場合は「Thinktankで開く」ボタンでフルUI

const QuickCaptureView: React.FC = () => (
  <div className="quick-capture-grid">
    <CaptureButton icon="📝" label="テキスト" onClick={captureText} />
    <CaptureButton icon="📷" label="写真" onClick={capturePhoto} />
    <CaptureButton icon="🎤" label="音声" onClick={captureVoice} />
    <CaptureButton icon="📍" label="位置" onClick={captureLocation} />
  </div>
);
```

起動モード設定:
```typescript
S.RegisterState('Mobile.LaunchMode', {
  Default: () => 'quick_capture' // 'quick_capture' | 'full'
});
```

---

## 段344: プッシュ通知（AI Suggestion配信）

AI FacilitatorのSuggestionをプッシュ通知で配信します。

```bash
npm install @capacitor/push-notifications
```

```typescript
// 記念日リコール、週次ダイジェスト等をプッシュ通知
// バックエンドからFCM (Firebase Cloud Messaging) 経由で送信
// 通知タップで該当メモまたはダイジェストを表示
```

---

## 段345: Apple Watch コンパニオンアプリ（概要設計）

Apple Watchアプリは最小限の機能に絞ります:

```
TT Stand Watch App
├── 音声メモ入力（Siri Dictation → API送信）
├── 直近のSuggestion表示（1件ずつカード形式）
├── クイックメモ（定型テキスト送信）
└── 今日のエントリー数表示（Complication）
```

技術:
```swift
// WatchOS App (SwiftUI)
struct ContentView: View {
    @State var voiceText = ""

    var body: some View {
        VStack {
            Button("🎤 音声メモ") {
                // presentTextInputController で音声入力
                // → /api/capture に POST
            }
            Text("今日: \(todayCount)件")
        }
    }
}
```

WatchとiPhone間の通信は WatchConnectivity を使用し、
iPhoneアプリ（Capacitor）経由でバックエンドAPIに転送します。

---

## 段346: オフラインキャプチャキュー（モバイル）

モバイルデバイスのオフラインキャプチャを確実に保存するための強化:

```typescript
// src/services/mobile/OfflineCaptureQueue.ts
export class OfflineCaptureQueue {
  // Capacitor Filesystem にキャプチャデータをローカル保存
  async enqueue(entry: Partial<TTEntry>, mediaBlob?: Blob): Promise<void>

  // オンライン復帰時にキューを処理
  async flush(): Promise<{ success: number; failed: number }>

  // キュー内の未送信件数
  async getPendingCount(): Promise<number>
}
```

ネットワーク監視:
```typescript
import { Network } from '@capacitor/network';

Network.addListener('networkStatusChange', async (status) => {
  if (status.connected) {
    await offlineCaptureQueue.flush();
  }
});
```

---

## 段347〜358: Phase 22 動作確認チェックリスト

- [ ] **段341**: Capacitorプロジェクトがビルド・起動できること
- [ ] **段342**: カメラ撮影→TTEntry保存が動作すること
- [ ] **段342**: 位置情報取得→TTEntry保存が動作すること
- [ ] **段343**: クイックキャプチャUIが起動時に表示されること
- [ ] **段344**: AI SuggestionがPush通知で届くこと
- [ ] **段345**: Apple Watch から音声メモが送信できること（Watch実機テスト）
- [ ] **段346**: オフラインでキャプチャしたデータがオンライン復帰後に送信されること
- [ ] iOS / Android の両プラットフォームでアプリが動作すること

---

**前フェーズ**: Phase 21☆ (クイックキャプチャ)
**プロジェクト完成**

---

## 付録: 更なる将来構想

| 機能 | 内容 | 優先度 |
|---|---|---|
| 共有機能 | 複数ユーザー対応（チーム知識ベース） | 低 |
| Google Photos連携 | 写真のタイムライン統合 | 低 |
| カレンダー統合 | Googleカレンダーのイベントをエントリー化 | 中 |
| 手書きメモ | Apple Pencil / スタイラス対応 | 低 |
| AIエージェント | Facilitatorが自律的にメモを整理・要約・再構成 | 将来 |
| ナレッジグラフDB | Neo4j等の本格的グラフDBへの移行 | 将来 |

以上の全22フェーズ・358段で **TT Stand** の段階的構築が完了します。
