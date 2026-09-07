import { describe, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({ save: vi.fn(), getContent: vi.fn() }));
vi.mock('../services/storage/StorageManager', () => ({ StorageManager: { instance: backend } }));
import { TTThink } from './TTThink';

describe('HTML Think storage contract', () => {
  it('saves html as a first-class category and restores the title/body without losing markup', async () => {
    const html = '<!doctype html>\n<html><body><h1>比較</h1></body></html>';
    const t = new TTThink();
    t.ID = '2026-09-07-120000'; t.ContentType = 'html';
    t.Content = '会場比較\n' + html;
    backend.save.mockResolvedValue({ updatedAt: '2026-09-07T12:00:00Z' });
    await t.SaveContent();
    expect(backend.save).toHaveBeenCalledWith(expect.objectContaining({ contentType: 'html', fullContent: '会場比較\n' + html }));
    expect(t.IsDirty).toBe(false);
    const loaded = new TTThink();
    loaded.ID = t.ID; loaded.ContentType = 'html'; loaded.setContentSilent('会場比較'); loaded.IsMetaOnly = true;
    backend.getContent.mockResolvedValue(html);
    await loaded.LoadContent();
    expect(loaded.Name).toBe('会場比較');
    expect(loaded.Content).toBe(t.Content);
    expect(loaded.IsMetaOnly).toBe(false);
  });
});
