'use strict';

/**
 * electron/vault/domainProfiles.cjs
 * .thinktank/prompts/ のドメインプロファイルの読み書き。
 * メソッドは electron/vaultEngine.cjs で VaultEngine.prototype に取り込む（this は VaultEngine）。
 */

const fs = require('fs');
const path = require('path');
const shared = require('../shared-dist/index.js');

class VaultDomainProfiles {
  /**
   * ドメインプロファイル（.thinktank/prompts/）を取得する。
   */
  getActiveDomainProfile() {
    const promptsDir = this.getPromptsDir();
    const activeJsonPath = path.join(promptsDir, 'active-profile.json');
    let profileId = this.config.activeProfileId || shared.DEFAULT_DOMAIN_PROFILE_ID;

    if (fs.existsSync(activeJsonPath)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(activeJsonPath, 'utf8'));
        if (typeof cfg.activeProfileId === 'string' && cfg.activeProfileId.trim()) {
          profileId = cfg.activeProfileId.trim();
        }
      } catch {
        // ignore
      }
    }

    return this.getDomainProfileById(profileId);
  }

  getDomainProfileById(profileId) {
    const promptsDir = this.getPromptsDir();
    const profilePath = path.join(promptsDir, profileId, 'profile.json');
    if (fs.existsSync(profilePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        return shared.resolveDomainProfile(raw, profileId);
      } catch (e) {
        console.warn(`[VaultEngine] Failed to parse profile.json (${profileId}):`, e.message);
      }
    }
    return shared.getBuiltinDomainProfile(profileId);
  }

  setActiveDomainProfile(profileId) {
    const resolved = this.getDomainProfileById(profileId);
    this.saveConfig({ activeProfileId: resolved.id });

    const promptsDir = this.getPromptsDir();
    const activeJsonPath = path.join(promptsDir, 'active-profile.json');
    try {
      fs.mkdirSync(promptsDir, { recursive: true });
      const current = fs.existsSync(activeJsonPath)
        ? JSON.parse(fs.readFileSync(activeJsonPath, 'utf8'))
        : { availableProfiles: Object.keys(shared.BUILTIN_DOMAIN_PROFILES) };
      current.activeProfileId = resolved.id;
      this._atomicWrite(activeJsonPath, JSON.stringify(current, null, 2) + '\n');
    } catch (e) {
      console.warn('[VaultEngine] Failed to write active-profile.json:', e.message);
    }
    return resolved;
  }
}

module.exports = { VaultDomainProfiles };
