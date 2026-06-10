// 単一エディタ領域の管理（MediaType、ResourceID、dirty）

import { TTObject } from '../models/TTObject';
import type { MediaType } from '../types';

let areaSeq = 0;

export class TTWorkoutArea extends TTObject {
  ResourceID = '';
  Media: MediaType = 'texteditor';

  constructor() {
    super();
    this.ID = `area-${Date.now()}-${areaSeq++}`;
  }

  SetResource(resourceId: string, media: MediaType): void {
    this.ResourceID = resourceId;
    this.Media = media;
    this.NotifyUpdated(false);
  }

  SetMedia(media: MediaType): void {
    this.Media = media;
    this.NotifyUpdated(false);
  }
}
