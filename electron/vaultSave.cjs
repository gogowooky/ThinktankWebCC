'use strict';
const { serialize, extractMetadata } = require('./mdFormat.cjs');
const { updateVaultRecord, nextVaultVersion } = require('./vaultWrite.cjs');

function saveVaultRecord(directory, payload) {
  return updateVaultRecord(directory, payload.thinkid, current => {
    const previousFm = current.meta;
    if (payload.baseUpdatedAt && previousFm?.updated_at !== payload.baseUpdatedAt) throw new Error('記録が別の場所で更新されました。開き直してから変更してください。');
    const now = nextVaultVersion(previousFm);
    const nl = payload.fullContent.indexOf('\n');
    const title = nl < 0 ? payload.fullContent : payload.fullContent.slice(0, nl);
    const body  = nl < 0 ? '' : payload.fullContent.slice(nl + 1);
    const metadataObj = payload.metadata ?? (previousFm ? extractMetadata(previousFm) : {});
    const frontmatterObj = {
      ...metadataObj,
      thinkid:     payload.thinkid,
      category:    payload.category,
      title,
      keywords:    payload.keywords || null,
      related_ids: payload.relatedIds || null,
      size_bytes:  Buffer.byteLength(payload.fullContent, 'utf8'),
      is_deleted:  false,
      created_at:  previousFm?.created_at || now,
      updated_at:  now,
    };
    return { text: serialize(frontmatterObj, body), result: {
      thinkid:     frontmatterObj.thinkid,
      category:    frontmatterObj.category,
      title:       frontmatterObj.title,
      keywords:    frontmatterObj.keywords,
      relatedIds:  frontmatterObj.related_ids,
      sizeBytes:   frontmatterObj.size_bytes,
      isDeleted:   frontmatterObj.is_deleted,
      createdAt:   frontmatterObj.created_at,
      updatedAt:   frontmatterObj.updated_at,
      metadata:    metadataObj,
    } };
  });
}
module.exports = { saveVaultRecord };
