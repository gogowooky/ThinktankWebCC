// 永続化オブジェクト基底（仕様書03 §1.2)

import { TTNotifyBase } from './TTNotifyBase';
import { formatUpdateTimestamp } from '../utils/dateUtils';

export class TTObject extends TTNotifyBase {
  ID = '';
  Name = '';
  UpdateDate = '';

  override NotifyUpdated(updateProperty = true): void {
    if (updateProperty) {
      this.UpdateDate = formatUpdateTimestamp();
    }
    super.NotifyUpdated(true);
  }
}
