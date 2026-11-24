/**
 * Thinktank Google Workspace 連携用 Google Apps Script（Gmail 読み取り・Google ドライブ読み書き・
 * Google カレンダー読み取り・Google Tasks(ToDo) 読み取り）。
 * 導入手順は docs/261123/GAS_GoogleWorkspace連携.md を参照。
 *
 * ウェブアプリとして「次のユーザーとして実行: 自分」「アクセスできるユーザー: 全員」で公開する。
 * スクリプト プロパティ THINKTANK_WORKSPACE_TOKEN の合言葉が一致した要求にだけ応答する。
 * 安全設計:
 * - Gmail・カレンダー・ToDo は読み取り専用（送信・削除・作成の実装を持たない）
 * - Google ドライブは読み取り・作成・更新のみ（削除の実装を持たない）
 */

var TOKEN_PROPERTY = 'THINKTANK_WORKSPACE_TOKEN';
var MAX_LIST_LIMIT = 50;
var MAX_BODY_CHARS = 12000;
var MAX_WRITE_CHARS = 200000;

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
        return respond_({
          ok: true,
          capabilities: ['gmail.read', 'calendar.read', 'tasks.read', 'drive.read', 'drive.write'],
        });
      case 'gmail_search':
        return respond_({ ok: true, threads: gmailSearch_(req.query, req.limit) });
      case 'gmail_read':
        return respond_({ ok: true, thread: gmailReadThread_(req.threadId, req.maxChars) });
      case 'calendar_events':
        return respond_({ ok: true, events: calendarListEvents_(req.startIso, req.endIso, req.limit) });
      case 'tasks_list':
        return respond_({ ok: true, taskLists: tasksListAll_(req.includeCompleted, req.limit) });
      case 'drive_search':
        return respond_({ ok: true, files: driveSearch_(req.query, req.folderId, req.limit) });
      case 'drive_read':
        return respond_({ ok: true, file: driveReadFile_(req.fileId, req.maxChars) });
      case 'drive_write':
        return respond_({ ok: true, file: driveWriteFile_(req) });
      default:
        return respond_({ ok: false, error: 'unknown kind: ' + String(req.kind || '') });
    }
  } catch (err) {
    return respond_({ ok: false, error: err && err.message ? String(err.message) : String(err) });
  }
}

// ── Gmail（読み取り専用） ────────────────────────────────────────────────────

function gmailSearch_(query, limit) {
  var q = typeof query === 'string' && query.trim() ? query.trim() : 'newer_than:3d';
  var max = clampLimit_(limit, 20);
  var threads = GmailApp.search(q, 0, max);
  var out = [];
  for (var i = 0; i < threads.length; i++) {
    var t = threads[i];
    var msgs = t.getMessages();
    var last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    var id = t.getId();
    out.push({
      threadId: id,
      subject: t.getFirstMessageSubject() || '(件名なし)',
      from: last ? last.getFrom() : '',
      date: last ? last.getDate().toISOString() : '',
      unread: t.isUnread(),
      messageCount: msgs.length,
      snippet: last ? clipText_(last.getPlainBody(), 240) : '',
      url: 'https://mail.google.com/mail/u/0/#inbox/' + id,
    });
  }
  return out;
}

function gmailReadThread_(threadId, maxChars) {
  var id = checkId_(threadId, /^[0-9a-f]{1,32}$/i);
  var t = GmailApp.getThreadById(id);
  if (!t) throw new Error('Gmail thread not found: ' + id);
  var budget = clampNumber_(maxChars, 1000, MAX_BODY_CHARS, 6000);
  var msgs = t.getMessages();
  var items = [];
  for (var i = 0; i < msgs.length; i++) {
    var m = msgs[i];
    items.push({
      messageId: m.getId(),
      from: m.getFrom(),
      to: m.getTo(),
      cc: m.getCc(),
      date: m.getDate().toISOString(),
      subject: m.getSubject(),
      body: clipText_(m.getPlainBody(), budget),
    });
  }
  return {
    threadId: id,
    subject: t.getFirstMessageSubject() || '(件名なし)',
    url: 'https://mail.google.com/mail/u/0/#inbox/' + id,
    messages: items,
  };
}

// ── Google カレンダー（読み取り専用） ─────────────────────────────────────────

function calendarListEvents_(startIso, endIso, limit) {
  var now = new Date();
  var start = startIso ? new Date(startIso) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  var end = endIso ? new Date(endIso) : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('invalid startIso or endIso');
  }
  var max = clampLimit_(limit, 30);
  var cal = CalendarApp.getDefaultCalendar();
  var events = cal.getEvents(start, end);
  var out = [];
  for (var i = 0; i < events.length && out.length < max; i++) {
    var ev = events[i];
    var guests = ev.getGuestList();
    var guestNames = [];
    for (var g = 0; g < guests.length && guestNames.length < 10; g++) {
      guestNames.push(guests[g].getEmail());
    }
    out.push({
      id: ev.getId(),
      title: ev.getTitle() || '(無題)',
      start: ev.getStartTime().toISOString(),
      end: ev.getEndTime().toISOString(),
      isAllDay: ev.isAllDayEvent(),
      location: ev.getLocation() || '',
      description: clipText_(ev.getDescription() || '', 800),
      guests: guestNames,
    });
  }
  return out;
}

// ── Google Tasks / ToDo（読み取り専用・拡張サービス Tasks が必要） ────────────

function tasksListAll_(includeCompleted, limit) {
  if (typeof Tasks === 'undefined' || !Tasks.Tasklists || !Tasks.Tasks) {
    throw new Error('GAS エディタの「サービス」から Google Tasks API（Tasks）を追加してください。');
  }
  var max = clampLimit_(limit, 50);
  var showCompleted = includeCompleted === true;
  var listsRes = Tasks.Tasklists.list({ maxResults: 20 });
  var lists = (listsRes && listsRes.items) || [];
  var out = [];
  for (var i = 0; i < lists.length; i++) {
    var list = lists[i];
    var tasksRes = Tasks.Tasks.list(list.id, {
      maxResults: max,
      showCompleted: showCompleted,
      showHidden: false,
    });
    var items = (tasksRes && tasksRes.items) || [];
    var mapped = [];
    for (var j = 0; j < items.length; j++) {
      var task = items[j];
      if (!showCompleted && task.status === 'completed') continue;
      mapped.push({
        id: task.id,
        title: task.title || '(無題)',
        notes: clipText_(task.notes || '', 500),
        due: task.due || '',
        status: task.status || 'needsAction',
        updated: task.updated || '',
      });
    }
    out.push({
      listId: list.id,
      title: list.title || '(無題リスト)',
      tasks: mapped,
    });
  }
  return out;
}

// ── Google ドライブ（読み書き・削除不可） ────────────────────────────────────

function driveSearch_(query, folderId, limit) {
  var max = clampLimit_(limit, 20);
  var iter;
  if (typeof folderId === 'string' && folderId.trim()) {
    var folder = DriveApp.getFolderById(checkId_(folderId.trim(), /^[A-Za-z0-9_-]{10,}$/));
    if (typeof query === 'string' && query.trim()) {
      iter = folder.searchFiles(buildDriveSearchQuery_(query.trim()));
    } else {
      iter = folder.getFiles();
    }
  } else if (typeof query === 'string' && query.trim()) {
    iter = DriveApp.searchFiles(buildDriveSearchQuery_(query.trim()));
  } else {
    iter = DriveApp.searchFiles('trashed = false');
  }
  var out = [];
  while (iter.hasNext() && out.length < max) {
    var f = iter.next();
    if (f.isTrashed()) continue;
    out.push({
      id: f.getId(),
      name: f.getName(),
      mimeType: f.getMimeType(),
      updatedAt: f.getLastUpdated().toISOString(),
      url: f.getUrl(),
    });
  }
  return out;
}

function buildDriveSearchQuery_(keyword) {
  var escaped = keyword.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return "trashed = false and (title contains '" + escaped + "' or fullText contains '" + escaped + "')";
}

function driveReadFile_(fileId, maxChars) {
  var id = checkId_(fileId, /^[A-Za-z0-9_-]{10,}$/);
  var file = DriveApp.getFileById(id);
  var mime = file.getMimeType();
  var budget = clampNumber_(maxChars, 1000, MAX_BODY_CHARS, 10000);
  var content = '';

  if (mime === MimeType.GOOGLE_DOCS) {
    content = DocumentApp.openById(id).getBody().getText();
  } else if (mime === MimeType.GOOGLE_SHEETS) {
    var ss = SpreadsheetApp.openById(id);
    var sheets = ss.getSheets();
    var parts = [];
    for (var i = 0; i < sheets.length && i < 5; i++) {
      var sheet = sheets[i];
      var rows = sheet.getDataRange().getDisplayValues();
      var lines = ['## ' + sheet.getName()];
      for (var r = 0; r < rows.length && r < 200; r++) {
        lines.push(rows[r].join('\t'));
      }
      parts.push(lines.join('\n'));
    }
    content = parts.join('\n\n');
  } else if (
    mime.indexOf('text/') === 0 ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/javascript'
  ) {
    content = file.getBlob().getDataAsString('UTF-8');
  } else {
    throw new Error('テキストとして読めない形式です（mimeType: ' + mime + '）。Google ドキュメント・スプレッドシート・テキスト系ファイルに対応しています。');
  }

  return {
    id: file.getId(),
    name: file.getName(),
    mimeType: mime,
    updatedAt: file.getLastUpdated().toISOString(),
    url: file.getUrl(),
    content: clipText_(content, budget),
    truncated: content.length > budget,
  };
}

function driveWriteFile_(req) {
  var content = typeof req.content === 'string' ? req.content : '';
  if (content.length > MAX_WRITE_CHARS) {
    throw new Error('書き込み内容が上限（' + MAX_WRITE_CHARS + '文字）を超えています。');
  }
  var append = req.append === true;

  // 既存ファイルの更新
  if (typeof req.fileId === 'string' && req.fileId.trim()) {
    var id = checkId_(req.fileId.trim(), /^[A-Za-z0-9_-]{10,}$/);
    var existing = DriveApp.getFileById(id);
    var mime = existing.getMimeType();
    if (mime === MimeType.GOOGLE_DOCS) {
      var doc = DocumentApp.openById(id);
      var body = doc.getBody();
      if (append) {
        body.appendParagraph(content);
      } else {
        body.setText(content);
      }
      doc.saveAndClose();
    } else if (mime.indexOf('text/') === 0 || mime === 'application/json') {
      var next = append ? existing.getBlob().getDataAsString('UTF-8') + '\n' + content : content;
      existing.setContent(next);
    } else {
      throw new Error('このファイル形式は更新できません（mimeType: ' + mime + '）。');
    }
    return {
      action: append ? 'appended' : 'updated',
      id: existing.getId(),
      name: existing.getName(),
      mimeType: mime,
      url: existing.getUrl(),
    };
  }

  // 新規ファイルの作成
  var name = typeof req.name === 'string' && req.name.trim() ? req.name.trim() : '';
  if (!name) throw new Error('新規作成時は name（ファイル名）が必要です。');
  var folder = typeof req.folderId === 'string' && req.folderId.trim()
    ? DriveApp.getFolderById(checkId_(req.folderId.trim(), /^[A-Za-z0-9_-]{10,}$/))
    : DriveApp.getRootFolder();
  var format = req.format === 'google_doc' ? 'google_doc' : 'text';

  if (format === 'google_doc') {
    var createdDoc = DocumentApp.create(name);
    createdDoc.getBody().setText(content);
    createdDoc.saveAndClose();
    var docFile = DriveApp.getFileById(createdDoc.getId());
    if (folder.getId() !== DriveApp.getRootFolder().getId()) {
      docFile.moveTo(folder);
    }
    return {
      action: 'created',
      id: docFile.getId(),
      name: docFile.getName(),
      mimeType: docFile.getMimeType(),
      url: docFile.getUrl(),
    };
  }

  var mimeType = name.toLowerCase().slice(-3) === '.md' ? 'text/markdown' : 'text/plain';
  var createdFile = folder.createFile(name, content, mimeType);
  return {
    action: 'created',
    id: createdFile.getId(),
    name: createdFile.getName(),
    mimeType: createdFile.getMimeType(),
    url: createdFile.getUrl(),
  };
}

// ── 共通ユーティリティ ───────────────────────────────────────────────────────

function clampLimit_(value, fallback) {
  return clampNumber_(value, 1, MAX_LIST_LIMIT, fallback);
}

function clampNumber_(value, min, max, fallback) {
  var n = Number(value);
  if (!isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function clipText_(text, maxChars) {
  var s = String(text || '').trim();
  return s.length > maxChars ? s.slice(0, maxChars) + '\n…（以下省略）' : s;
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
  console.log('Thinktank に入力する合言葉: ' + token);
}

/** 権限の承認用。エディタから一度実行して Gmail・Drive・Calendar・Tasks の許可を与える */
function authorize() {
  GmailApp.search('newer_than:1d', 0, 1);
  DriveApp.getRootFolder().getName();
  CalendarApp.getDefaultCalendar().getName();
  if (typeof Tasks !== 'undefined' && Tasks.Tasklists) {
    Tasks.Tasklists.list({ maxResults: 1 });
  }
  console.log('権限の承認が完了しました。');
}
