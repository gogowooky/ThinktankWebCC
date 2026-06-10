// 共通型定義

export type AppMode = 'local' | 'online';

export type ContentType = 'memo' | 'thought' | 'table' | 'links' | 'chat' | 'nettext';

export type MediaType = 'texteditor' | 'markdown' | 'datagrid' | 'card' | 'graph' | 'chat';

export type LayoutMode = 'standard' | 'compact';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ストレージ共通メタデータ
export interface ThinkMeta {
  id: string;
  contentType: string;
  title: string;
  keywords: string;
  relatedIds: string;
  sizeBytes: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavePayload {
  id: string;
  contentType: string;
  fullContent: string;
  keywords: string;
  relatedIds: string;
}

export interface IStorageBackend {
  listMeta(): Promise<ThinkMeta[]>;
  getContent(id: string): Promise<string | null>;
  save(payload: SavePayload): Promise<ThinkMeta>;
  delete(id: string): Promise<void>;
  search(query: string): Promise<ThinkMeta[]>;
}

// ContentType → 選択可能 MediaType のマッピング（仕様書02 §6）
export const MEDIA_TYPE_MAP: Record<ContentType, { initial: MediaType; list: MediaType[] }> = {
  memo:    { initial: 'texteditor', list: ['texteditor', 'markdown'] },
  nettext: { initial: 'texteditor', list: ['texteditor', 'markdown'] },
  thought: { initial: 'datagrid',   list: ['texteditor', 'datagrid', 'markdown', 'card', 'graph'] },
  table:   { initial: 'datagrid',   list: ['texteditor', 'datagrid', 'card'] },
  chat:    { initial: 'chat',       list: ['texteditor', 'chat'] },
  links:   { initial: 'texteditor', list: ['texteditor', 'markdown'] },
};

// WorkoutPanel BSPツリー（仕様書02 §2.1）
export type LayoutNode = LeafNode | SplitNodeData;

export interface LeafNode {
  id: string;
  type: 'leaf';
  areaId: string;
}

export interface SplitNodeData {
  id: string;
  type: 'split';
  direction: 'v' | 'h';
  first: LayoutNode;
  second: LayoutNode;
}

declare global {
  interface Window {
    electronAPI?: {
      listMeta(): Promise<ThinkMeta[]>;
      getContent(id: string): Promise<string | null>;
      save(payload: SavePayload): Promise<ThinkMeta>;
      delete(id: string): Promise<void>;
      search(query: string): Promise<ThinkMeta[]>;
      syncFromServer(): Promise<unknown>;
    };
    __THINKTANK_MODE__?: string;
  }
}
