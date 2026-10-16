/**
 * src/platform/capabilities.ts
 * PC版（Electron）・Web版（PCブラウザ）・携帯Web版の機能境界定義（システム設計メモ §7・§11 準拠）。
 * - 以前は StorageManager.mode === 'pwa' のみで思考支援・AIを有効化していたが、
 *   新設計では PC版（ローカル AI CLI）および Web版PC（中継役PC経由）の双方で思考支援・業務管理・AIを有効化する。
 * - 携帯Web版は DisplayMode=Edit（メモ閲覧・編集・Drive保存）に専念し、AI機能は無効化する。
 */

export type RuntimeEnvironment = 'electron' | 'web-desktop' | 'web-mobile';

export interface PlatformCapabilities {
  env: RuntimeEnvironment;
  supportsVaultEdit: boolean;
  supportsThoughtSupport: boolean;
  supportsAiExecution: boolean;
  supportsRelayHost: boolean;
  supportsDriveDirectSave: boolean;
  defaultDisplayMode?: 'Edit';
}

export function isMobileViewportOrAgent(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent || '';
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return true;
  }
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(max-width: 767px)').matches;
  }
  return false;
}

export function detectPlatformCapabilities(): PlatformCapabilities {
  const hasElectron = typeof window !== 'undefined' && Boolean(window.electronAPI);
  if (hasElectron) {
    return {
      env: 'electron',
      supportsVaultEdit: true,
      supportsThoughtSupport: true,
      supportsAiExecution: true,
      supportsRelayHost: true,
      supportsDriveDirectSave: false,
    };
  }

  const isMobile = isMobileViewportOrAgent();
  if (isMobile) {
    return {
      env: 'web-mobile',
      supportsVaultEdit: true,
      supportsThoughtSupport: false,
      supportsAiExecution: false,
      supportsRelayHost: false,
      supportsDriveDirectSave: true,
      defaultDisplayMode: 'Edit',
    };
  }

  return {
    env: 'web-desktop',
    supportsVaultEdit: true,
    supportsThoughtSupport: true,
    supportsAiExecution: true,
    supportsRelayHost: false,
    supportsDriveDirectSave: true,
  };
}
