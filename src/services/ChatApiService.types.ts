export interface ChatRequestMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatStreamCallbacks {
  onDelta: (text: string) => void;
  onDone: (metadata?: { createdFileId?: string; category?: string }) => void;
  onError: (message: string) => void;
}
