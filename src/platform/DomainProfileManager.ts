/**
 * src/platform/DomainProfileManager.ts
 * ドメインプロファイル（clinical-trial / elderly-support / カスタム編集）の状態管理・永続化・React Hook。
 * - PC版 (Electron): window.electronAPI.profile を通じて .thinktank/prompts/<id>/profile.json と連携
 * - Web版: localStorage および Drive の .thinktank/prompts/<id>/profile.json と連携
 */

import { useEffect, useState } from 'react';
import {
  BUILTIN_DOMAIN_PROFILES,
  CLINICAL_TRIAL_PROFILE,
  DEFAULT_DOMAIN_PROFILE_ID,
  resolveDomainProfile,
  type DomainProfile,
} from '../../shared/domainProfile';

const STORAGE_KEY_ACTIVE_ID = 'thinktank.domainProfile.activeId';
const STORAGE_KEY_CUSTOM_PREFIX = 'thinktank.domainProfile.custom.';

type Listener = (profile: DomainProfile) => void;

class DomainProfileManagerImpl {
  private currentProfile: DomainProfile = CLINICAL_TRIAL_PROFILE;
  private initialized = false;
  private listeners = new Set<Listener>();

  constructor() {
    this.loadFromLocalFallback();
  }

  private loadFromLocalFallback(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const savedId = localStorage.getItem(STORAGE_KEY_ACTIVE_ID) || DEFAULT_DOMAIN_PROFILE_ID;
      const customRaw = localStorage.getItem(`${STORAGE_KEY_CUSTOM_PREFIX}${savedId}`);
      if (customRaw) {
        this.currentProfile = resolveDomainProfile(JSON.parse(customRaw), savedId);
      } else {
        this.currentProfile = BUILTIN_DOMAIN_PROFILES[savedId] ?? CLINICAL_TRIAL_PROFILE;
      }
    } catch {
      this.currentProfile = CLINICAL_TRIAL_PROFILE;
    }
  }

  public get activeProfile(): DomainProfile {
    return this.currentProfile;
  }

  public get availableProfiles(): DomainProfile[] {
    return Object.values(BUILTIN_DOMAIN_PROFILES);
  }

  public async initialize(): Promise<DomainProfile> {
    if (this.initialized) return this.currentProfile;
    this.initialized = true;

    if (typeof window !== 'undefined' && window.electronAPI?.profile) {
      try {
        const raw = await window.electronAPI.profile.getActive();
        this.currentProfile = resolveDomainProfile(raw, DEFAULT_DOMAIN_PROFILE_ID);
        this.notify();
      } catch {
        // Fallback already loaded
      }
    }
    return this.currentProfile;
  }

  public async switchProfile(profileId: string): Promise<DomainProfile> {
    if (typeof window !== 'undefined' && window.electronAPI?.profile) {
      try {
        const raw = await window.electronAPI.profile.setActive(profileId);
        this.currentProfile = resolveDomainProfile(raw, profileId);
      } catch {
        this.currentProfile = BUILTIN_DOMAIN_PROFILES[profileId] ?? CLINICAL_TRIAL_PROFILE;
      }
    } else {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY_ACTIVE_ID, profileId);
          const customRaw = localStorage.getItem(`${STORAGE_KEY_CUSTOM_PREFIX}${profileId}`);
          this.currentProfile = customRaw
            ? resolveDomainProfile(JSON.parse(customRaw), profileId)
            : (BUILTIN_DOMAIN_PROFILES[profileId] ?? CLINICAL_TRIAL_PROFILE);
        } else {
          this.currentProfile = BUILTIN_DOMAIN_PROFILES[profileId] ?? CLINICAL_TRIAL_PROFILE;
        }
      } catch {
        this.currentProfile = BUILTIN_DOMAIN_PROFILES[profileId] ?? CLINICAL_TRIAL_PROFILE;
      }
    }
    this.notify();
    return this.currentProfile;
  }

  public async saveCustomProfile(updated: DomainProfile): Promise<DomainProfile> {
    const resolved = resolveDomainProfile(updated, updated.id);
    if (typeof window !== 'undefined' && window.electronAPI?.profile) {
      try {
        await window.electronAPI.profile.saveCustom(resolved);
      } catch {
        // Also persist to localStorage below
      }
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_ACTIVE_ID, resolved.id);
        localStorage.setItem(`${STORAGE_KEY_CUSTOM_PREFIX}${resolved.id}`, JSON.stringify(resolved));
      }
    } catch {
      // ignore
    }
    this.currentProfile = resolved;
    this.notify();
    return this.currentProfile;
  }

  public async resetProfileToDefault(profileId: string): Promise<DomainProfile> {
    const base = BUILTIN_DOMAIN_PROFILES[profileId] ?? CLINICAL_TRIAL_PROFILE;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(`${STORAGE_KEY_CUSTOM_PREFIX}${profileId}`);
      }
    } catch {
      // ignore
    }
    return this.saveCustomProfile(structuredClone(base));
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const l of this.listeners) {
      l(this.currentProfile);
    }
  }
}

export const DomainProfileManager = new DomainProfileManagerImpl();

export function useDomainProfile(): {
  profile: DomainProfile;
  availableProfiles: DomainProfile[];
  switchProfile: (profileId: string) => Promise<DomainProfile>;
  saveCustomProfile: (updated: DomainProfile) => Promise<DomainProfile>;
  resetProfileToDefault: (profileId: string) => Promise<DomainProfile>;
} {
  const [profile, setProfile] = useState<DomainProfile>(() => DomainProfileManager.activeProfile);

  useEffect(() => {
    void DomainProfileManager.initialize();
    return DomainProfileManager.subscribe(setProfile);
  }, []);

  return {
    profile,
    availableProfiles: DomainProfileManager.availableProfiles,
    switchProfile: (id) => DomainProfileManager.switchProfile(id),
    saveCustomProfile: (p) => DomainProfileManager.saveCustomProfile(p),
    resetProfileToDefault: (id) => DomainProfileManager.resetProfileToDefault(id),
  };
}
