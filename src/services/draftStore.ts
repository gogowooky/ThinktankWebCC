import type { TTVault } from '../models/TTVault';

interface DraftRegistration {
  records: Map<string, unknown>;
  hasUnsaved: () => boolean;
}
interface VaultDraftScope {
  identity: number;
  drafts: Map<symbol, DraftRegistration>;
  activeWarnings: Set<() => boolean>;
}
export interface DraftVaultLease { readonly identity: number; isCurrent: () => boolean }

let vaultScopes = new WeakMap<TTVault, VaultDraftScope>();
const activeScopes = new Set<VaultDraftScope>();
let nextIdentity = 0;
let listening = false;

export function hasUnsavedDrafts(): boolean {
  for (const scope of activeScopes) {
    for (const draft of scope.drafts.values()) if (draft.hasUnsaved()) return true;
    for (const warn of scope.activeWarnings) if (warn()) return true;
  }
  return false;
}

function warnBeforeUnload(event: BeforeUnloadEvent): void {
  if (!hasUnsavedDrafts()) return;
  event.preventDefault();
  event.returnValue = '';
}

function scopeFor(vault: TTVault): VaultDraftScope {
  let scope = vaultScopes.get(vault);
  if (!scope) {
    scope = { identity: ++nextIdentity, drafts: new Map(), activeWarnings: new Set() };
    vaultScopes.set(vault, scope);
    activeScopes.add(scope);
  }
  if (!listening && typeof window !== 'undefined') {
    window.addEventListener('beforeunload', warnBeforeUnload);
    listening = true;
  }
  return scope;
}

/** Reactの画面寿命より長く保持し、同じIDの別Vaultには渡さない。 */
export function createDraftStore<Draft>(hasUnsaved: (draft: Draft) => boolean) {
  const kind = Symbol('draft-kind');
  function map(vault: TTVault, lifetime?: DraftVaultLease): Map<string, Draft> {
    if (lifetime && !lifetime.isCurrent()) return new Map<string, Draft>();
    const scope = scopeFor(vault);
    let registration = scope.drafts.get(kind);
    if (!registration) {
      const records = new Map<string, Draft>();
      registration = { records, hasUnsaved: () => [...records.values()].some(hasUnsaved) };
      scope.drafts.set(kind, registration);
    }
    return registration.records as Map<string, Draft>;
  }
  return {
    map,
    get(vault: TTVault, key: string, create: () => Draft, lifetime?: DraftVaultLease): Draft {
      const records = map(vault, lifetime);
      let draft = records.get(key);
      if (!draft) { draft = create(); records.set(key, draft); }
      return draft;
    },
  };
}

/** reset前に開始した処理は、新しいscopeが作られても旧scopeへ戻せない。 */
export function draftVaultLease(vault: TTVault): DraftVaultLease {
  const scope = scopeFor(vault);
  return { identity: scope.identity, isCurrent: () => vaultScopes.get(vault) === scope };
}

/** 処理中のrefなど、画面が存在するときだけ必要な警告も同じlistenerで判定する。 */
export function registerDraftWarning(vault: TTVault, warning: () => boolean, lifetime?: DraftVaultLease): () => void {
  if (lifetime && !lifetime.isCurrent()) return () => {};
  const scope = scopeFor(vault);
  scope.activeWarnings.add(warning);
  return () => { scope.activeWarnings.delete(warning); };
}

function clearScope(scope: VaultDraftScope): void {
  for (const draft of scope.drafts.values()) draft.records.clear();
  scope.drafts.clear();
  scope.activeWarnings.clear();
  activeScopes.delete(scope);
}

function stopWhenEmpty(): void {
  if (activeScopes.size || !listening) return;
  window.removeEventListener('beforeunload', warnBeforeUnload);
  listening = false;
}

export function disposeVaultDrafts(vault: TTVault): void {
  const scope = vaultScopes.get(vault);
  if (!scope) return;
  clearScope(scope);
  vaultScopes.delete(vault);
  stopWhenEmpty();
}

/** 明示的なアプリresetでは隠れた画面の入力や完了待ちも旧アプリから切り離す。 */
export function resetDraftStores(): void {
  for (const scope of activeScopes) clearScope(scope);
  vaultScopes = new WeakMap();
  stopWhenEmpty();
}
