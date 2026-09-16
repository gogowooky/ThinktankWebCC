import { useState } from 'react';
import type { TTVault } from '../../models/TTVault';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { readTaskRelation } from '../../services/taskRelation';

export function SubtaskList({ vault, bundleId }: { vault: TTVault; bundleId: string }) {
  useAppUpdate(vault);
  const [message, setMessage] = useState('');
  const children = vault.GetBundles().filter(b => readTaskRelation(b.Metadata.taskRelation)?.parentId === bundleId);
  const relation = readTaskRelation(vault.GetThink(bundleId)?.Metadata.taskRelation);
  async function open(id: string) {
    try {
      const { TTApplication } = await import('../../views/TTApplication');
      const app = TTApplication.Instance;
      if (app.Models.Vault !== vault || vault.GetThink(id)?.ContentType !== 'bundle') throw new Error('課題が見つかりません。');
      app.OpenBundle(id, 'graph');
    } catch (e) { setMessage((e as Error).message); }
  }
  if (!children.length && !relation) return null;
  return <section aria-label="関連する課題">
    {relation && <button type="button" onClick={() => void open(relation.parentId)}>親課題へ戻る</button>}
    {children.length > 0 && <><h3>サブ課題</h3><ul>{children.map(child => <li key={child.ID}>
      <button type="button" onClick={() => void open(child.ID)}>{child.Name}</button> · 担当：Workout
    </li>)}</ul></>}
    {message && <p role="status">{message}</p>}
  </section>;
}
