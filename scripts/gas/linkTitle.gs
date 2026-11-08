/**
 * Thinktank linkファイルのタイトル取得用 Google Apps Script。
 * 導入手順は docs/261108/GASリンクタイトル取得.md を参照。
 *
 * ウェブアプリとして「次のユーザーとして実行: 自分」「アクセスできるユーザー: 全員」で公開する。
 * 誰でも呼べるURLになるため、スクリプト プロパティ THINKTANK_TOKEN の合言葉が一致した要求にだけ、
 * ファイル名・フォルダー名・メール件名の1項目だけを返す（本文や宛先は返さない）。
 */

var TOKEN_PROPERTY = 'THINKTANK_TOKEN';

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond_({ ok: false, error: 'bad request' });
  }

  var token = PropertiesService.getScriptProperties().getProperty(TOKEN_PROPERTY);
  if (!token || typeof req.token !== 'string' || req.token !== token) {
    return respond_({ ok: false, error: 'unauthorized' });
  }

  try {
    switch (req.kind) {
      case 'ping':
        return respond_({ ok: true });
      case 'drive':
        return respond_({ ok: true, title: driveName_(req.id) });
      case 'gmailThread':
        return respond_({ ok: true, title: gmailThreadSubject_(req.id) });
      case 'gmailMessage':
        return respond_({ ok: true, title: gmailMessageSubject_(req.id) });
      default:
        return respond_({ ok: false, error: 'unknown kind' });
    }
  } catch (err) {
    return respond_({ ok: false, error: 'not found' });
  }
}

function driveName_(id) {
  checkId_(id, /^[A-Za-z0-9_-]{10,}$/);
  try {
    return DriveApp.getFileById(id).getName();
  } catch (err) {
    return DriveApp.getFolderById(id).getName();
  }
}

// GmailApp は全権限（https://mail.google.com/）を要するため、件名だけ読める gmail.metadata で使える
// 拡張サービス Gmail（Gmail API）を使う
function gmailThreadSubject_(id) {
  var thread = Gmail.Users.Threads.get('me', checkId_(id, /^[0-9a-f]{1,16}$/i), { format: 'metadata', metadataHeaders: ['Subject'] });
  return subjectOf_(thread.messages && thread.messages[0]);
}

function gmailMessageSubject_(id) {
  var message = Gmail.Users.Messages.get('me', checkId_(id, /^[0-9a-f]{1,16}$/i), { format: 'metadata', metadataHeaders: ['Subject'] });
  return subjectOf_(message);
}

function subjectOf_(message) {
  var headers = (message && message.payload && message.payload.headers) || [];
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i].name).toLowerCase() === 'subject') return headers[i].value;
  }
  return '';
}

function checkId_(id, pattern) {
  if (typeof id !== 'string' || !pattern.test(id)) throw new Error('invalid id');
  return id;
}

function respond_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

/** 初回だけエディタから実行する。合言葉を作って保存し、ログに表示する */
function setupToken() {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty(TOKEN_PROPERTY, token);
  // Logger.log は実行ログに出ない環境があるため console.log を使う
  console.log('Thinktank に入力する合言葉: ' + token);
}

/** 権限の承認用。エディタから一度実行すると Gmail・Drive の読み取り許可を求められる */
function authorize() {
  DriveApp.getRootFolder().getName();
  Gmail.Users.Labels.list('me');
}
