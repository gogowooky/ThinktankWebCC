// CSVシリアライズ・デシリアライズ可能な子ノード管理クラス（仕様書03 §1.3）

import { TTObject } from './TTObject';
import { parseCsvLine, escapeCsvValue } from '../utils/tableFormat';

export class TTCollection<T extends TTObject = TTObject> extends TTObject {
  protected _children = new Map<string, T>();

  /** シリアライズ対象プロパティ名（カンマ区切り） */
  ItemSaveProperties = 'ID,Name,UpdateDate';

  get Children(): T[] {
    return [...this._children.values()];
  }

  GetChild(id: string): T | undefined {
    return this._children.get(id);
  }

  AddChild(item: T): void {
    item._parent = this;
    this._children.set(item.ID, item);
  }

  RemoveChild(id: string): void {
    const item = this._children.get(id);
    if (item) item._parent = null;
    this._children.delete(id);
  }

  ClearChildren(): void {
    for (const c of this._children.values()) c._parent = null;
    this._children.clear();
  }

  SerializeToCsv(): string {
    const props = this.ItemSaveProperties.split(',').map((p) => p.trim());
    const lines = [props.join(',')];
    for (const child of this._children.values()) {
      const rec = child as unknown as Record<string, unknown>;
      lines.push(props.map((p) => escapeCsvValue(String(rec[p] ?? ''))).join(','));
    }
    return lines.join('\n');
  }

  DeserializeFromCsv(csv: string, factory: () => T): void {
    const lines = csv.split('\n').filter((l) => l.trim() !== '');
    if (lines.length === 0) return;
    const props = parseCsvLine(lines[0]).map((p) => p.trim());
    this.ClearChildren();
    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]);
      const item = factory();
      const rec = item as unknown as Record<string, unknown>;
      props.forEach((p, idx) => {
        if (values[idx] !== undefined) rec[p] = values[idx];
      });
      this.AddChild(item);
    }
  }
}
