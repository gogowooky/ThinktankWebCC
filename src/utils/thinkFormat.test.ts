import { describe, it, expect } from 'vitest';
import {
  PROJECT_OUTLOOKS,
  PROJECT_STATES,
  parseChat,
  serializeChat,
  splitContent,
  parseProject,
  projectTargetIds,
  readProjectStatus,
  targetsAllThinks,
  firstAiViewId,
  addAiViewIdToHead,
  readProjectSectionText,
  serializeProject,
  updateProjectTargets,
  projectHarnessIds,
  allProjectHarnessIds,
  firstHarnessId,
  setProjectHarnessId,
  setProjectState,
  addProjectDiscussionId,
  isHarnessProject,
} from './thinkFormat';

describe('AIハーネスの項目', () => {
  const base = [
    'P', '=', '# 対象', '[memo:2026-01-02-030405]',
    '# 規約', '決まったことは冒頭に書く', '[memo:2026-01-02-030406]',
    '# log', '[aiwork:2026-01-02-030410]',
    '# styles', '[aiwork:2026-01-02-030411], [aiview:2026-01-02-030412]', '[aiwork:2026-01-02-030413]',
    '# AIまとめ', '[aiview:2026-01-02-030407]',
    '# AI議論', '[chat:2026-01-02-030408]',
  ].join('\n');

  it('項目ごとの AIWork を読み、CSV と旧名のタグも読む', () => {
    expect(firstHarnessId(base, 'log')).toBe('2026-01-02-030410');
    expect(projectHarnessIds(base, 'styles')).toEqual(['2026-01-02-030411', '2026-01-02-030412', '2026-01-02-030413']);
    expect(firstHarnessId(base, 'status')).toBeNull();
    expect(allProjectHarnessIds(base)).toEqual(['2026-01-02-030410', '2026-01-02-030411', '2026-01-02-030412', '2026-01-02-030413']);
  });

  it('規約・ハーネスの参照も project の所属（ids）に含め、# 対象 には含めない', () => {
    expect(parseProject(base).ids).toEqual([
      '2026-01-02-030405', '2026-01-02-030406', '2026-01-02-030410',
      '2026-01-02-030411', '2026-01-02-030412', '2026-01-02-030413', '2026-01-02-030407', '2026-01-02-030408',
    ]);
    expect(projectTargetIds(base)).toEqual(['2026-01-02-030405']);
  });

  it('# 対象 を書き直してもハーネスの AIWork を重複させない', () => {
    const updated = updateProjectTargets(base, [
      { id: '2026-01-02-030405', contentType: 'memo' },
      { id: '2026-01-02-030410', contentType: 'aiview' },
      { id: '2026-01-02-030412', contentType: 'aiview' },
    ]);
    expect(projectTargetIds(updated)).toEqual(['2026-01-02-030405']);
  });

  it('見出しが無ければ # AIまとめ の前に加える', () => {
    expect(setProjectHarnessId(base, 'status', '2026-01-02-030420'))
      .toContain('[aiwork:2026-01-02-030413]\n# status\n[aiwork:2026-01-02-030420]\n# AIまとめ');
    expect(setProjectHarnessId('P\n=\n# 条件\n\n# AI議論', 'board', '2026-01-02-030420'))
      .toBe('P\n=\n# 条件\n# board\n[aiwork:2026-01-02-030420]\n# AI議論');
    expect(setProjectHarnessId('P\n=\n# 条件', 'PROFILE', '2026-01-02-030420'))
      .toBe('P\n=\n# 条件\n# PROFILE\n[aiwork:2026-01-02-030420]');
  });

  it('1件の項目は置き換え、複数の項目は末尾に加える', () => {
    const replaced = setProjectHarnessId(base, 'log', '2026-01-02-030420');
    expect(projectHarnessIds(replaced, 'log')).toEqual(['2026-01-02-030420']);
    const added = setProjectHarnessId(base, 'styles', '2026-01-02-030420');
    expect(projectHarnessIds(added, 'styles')).toEqual(['2026-01-02-030411', '2026-01-02-030412', '2026-01-02-030413', '2026-01-02-030420']);
    expect(setProjectHarnessId(base, 'styles', '2026-01-02-030412')).toBe(base);
    expect(firstHarnessId(added, 'log')).toBe('2026-01-02-030410');
  });

  it('# 状態 の書き換え・# AI議論 への追加・ハーネスの判定', () => {
    expect(setProjectState('P\n=\n# 見通し\nタスク\n# 状態\n未着手\n# 対象', '進行中')).toBe('P\n=\n# 見通し\nタスク\n# 状態\n進行中\n# 対象');
    expect(setProjectState('P\n=\n# 見通し\nタスク\n# 対象', '待機')).toBe('P\n=\n# 見通し\nタスク\n# 状態\n待機\n# 対象');
    expect(setProjectState('P\n=\n# 対象', '待機')).toBe('P\n=\n# 状態\n待機\n# 対象');
    expect(addProjectDiscussionId('P\n=\n# AI議論\n[chat:2026-01-02-030408]', '2026-01-02-030409'))
      .toBe('P\n=\n# AI議論\n[chat:2026-01-02-030408]\n[chat:2026-01-02-030409]');
    expect(addProjectDiscussionId('P\n=\n# AI議論\n[chat:2026-01-02-030408]', '2026-01-02-030408')).toBe('P\n=\n# AI議論\n[chat:2026-01-02-030408]');
    expect(addProjectDiscussionId('P\n=\n# 条件\n', '2026-01-02-030409')).toBe('P\n=\n# 条件\n# AI議論\n[chat:2026-01-02-030409]');
    expect(isHarnessProject(base)).toBe(true);
    expect(isHarnessProject('P\n=\n# 状態\n進行中\n# 対象')).toBe(false);
  });

  it('項目値の終わりの空行より後ろの自由記載は書き換えない', () => {
    const content = 'P\n=\n# decision\n[aiwork:2026-01-02-030410]\n\n自由記載\n# AI議論';
    expect(setProjectHarnessId(content, 'decision', '2026-01-02-030420'))
      .toBe('P\n=\n# decision\n[aiwork:2026-01-02-030420]\n\n自由記載\n# AI議論');
  });
});

describe('splitContent', () => {
  it('先頭行を title、残りを body に分割する', () => {
    expect(splitContent('タイトル\n本文1\n本文2')).toEqual({
      title: 'タイトル',
      body: '本文1\n本文2',
    });
  });

  it('改行が無い場合は body を空にする', () => {
    expect(splitContent('タイトルのみ')).toEqual({ title: 'タイトルのみ', body: '' });
  });

  it('空文字は title/body ともに空', () => {
    expect(splitContent('')).toEqual({ title: '', body: '' });
  });
});

describe('chat 形式の往復', () => {
  it('serialize → parse で role/content が保存される', () => {
    const messages = [
      { id: 'x', role: 'user' as const, content: 'こんにちは', timestamp: '' },
      { id: 'y', role: 'assistant' as const, content: '応答1行目\n応答2行目', timestamp: '' },
      { id: 'z', role: 'user' as const, content: '追加の質問', timestamp: '' },
    ];
    const restored = parseChat(serializeChat(messages));
    expect(restored.map((m) => ({ role: m.role, content: m.content }))).toEqual(
      messages.map((m) => ({ role: m.role, content: m.content })),
    );
  });

  it('タイトル付き serialize は先頭行にタイトルを置く', () => {
    const out = serializeChat([{ id: 'a', role: 'user', content: 'q', timestamp: '' }], 'MyChat');
    expect(out.split('\n')[0]).toBe('MyChat');
  });
});

describe('project 形式の往復', () => {
  it('ID リストの serialize → parse（新フォーマット）', () => {
    const ids = ['2026-01-02-030405', '2026-01-02-030406'];
    const serialized = serializeProject({ title: '束', ids });
    expect(serialized).toBe([
      '束',
      '=',
      '# 見通し',
      '未設定',
      '# 状態',
      '未着手',
      '# 対象',
      '[memo:2026-01-02-030405]',
      '[memo:2026-01-02-030406]',
      '# 現状把握用プロンプト',
      '# 進捗把握用プロンプト',
      '# 実績把握用プロンプト',
      '# 条件',
      '# AIまとめ',
      '# AI議論',
    ].join('\n'));
    const parsed = parseProject(serialized);
    expect(parsed.title).toBe('束');
    expect(parsed.ids).toEqual(ids);
  });

  it('# 見通し と # 状態 には候補の値だけを書く（「状態値：」は付けない）', () => {
    expect(PROJECT_OUTLOOKS).toEqual(['ビジョン', 'エリア', 'テーマ', 'タスク', 'アクション', '未設定']);
    expect(PROJECT_STATES).toEqual(['未着手', '進行中', '待機', '保留', '完了', '中止', '不明', 'ツール']);
    const lines = serializeProject({ title: 'P', outlook: 'ビジョン', status: 'ツール' }).split('\n');
    expect(lines.slice(lines.indexOf('# 見通し'), lines.indexOf('# 見通し') + 4)).toEqual(['# 見通し', 'ビジョン', '# 状態', 'ツール']);
  });

  it('# 見通し と # 状態 の値を読み、無い・候補外は 未設定 / 不明 にする', () => {
    expect(readProjectStatus(serializeProject({ title: 'P', outlook: 'タスク', status: '保留' }))).toEqual({ outlook: 'タスク', state: '保留' });
    expect(readProjectStatus('P\n=\n# 見通し\n\n  エリア  \n# 状態\n状態値：進行中')).toEqual({ outlook: '未設定', state: '進行中' });
    expect(readProjectStatus('P\n=\n# 見通し\n大きな目標\n# 対象')).toEqual({ outlook: '未設定', state: '不明' });
  });

  it('見通し・AIまとめ・AI議論を書き、AIの参照を読み分ける', () => {
    const serialized = serializeProject({
      title: 'P', outlook: 'テーマ',
      items: [{ id: '2026-01-02-030405', contentType: 'links', title: '資料' }],
      aiSummaryIds: ['2026-01-02-030407'], aiDiscussionIds: ['2026-01-02-030408'],
    });
    expect(serialized).toBe([
      'P', '=',
      '# 見通し', 'テーマ',
      '# 状態', '未着手',
      '# 対象', '[link:2026-01-02-030405]: 資料',
      '# 現状把握用プロンプト', '# 進捗把握用プロンプト', '# 実績把握用プロンプト', '# 条件',
      '# AIまとめ', '[aiwork:2026-01-02-030407]',
      '# AI議論', '[chat:2026-01-02-030408]',
    ].join('\n'));
    expect(parseProject(serialized)).toEqual({
      title: 'P',
      ids: ['2026-01-02-030405', '2026-01-02-030407', '2026-01-02-030408'],
      aiSummaryIds: ['2026-01-02-030407'],
      aiDiscussionIds: ['2026-01-02-030408'],
    });
    expect(projectTargetIds(serialized)).toEqual(['2026-01-02-030405']);
  });

  it('# 対象 に直接記載されたThinkだけを読む', () => {
    const content = [
      'P', '=', '# 対象', '[memo:2026-01-02-030405]', '[project:2026-01-02-030406]',
      '# AIまとめ', '[aiview:2026-01-02-030407]', '# AI議論', '[chat:2026-01-02-030408]', '',
      '[memo:2026-01-02-030409]: 自由記載',
    ].join('\n');
    expect(projectTargetIds(content)).toEqual(['2026-01-02-030405', '2026-01-02-030406']);
  });

  it('# 対象 の更新では url/path/検索タグ・Linkタグ名を残し、AIの参照を重複させない', () => {
    const content = [
      'P', '=', '# 状態', '進行中',
      '# 対象',
      '[gdrive:2026-01-02-030405]: 資料',
      '[link:2026-01-02-030406]: リンク',
      'https://example.com/',
      '"C:\\docs\\plan.md"',
      '[Google:検索語]',
      '# AI議論', '[chat:2026-01-02-030408]',
    ].join('\n');
    const updated = updateProjectTargets(content, [
      { id: '2026-01-02-030405', contentType: 'links', title: '資料' },
      { id: '2026-01-02-030406', contentType: 'links', title: 'リンク' },
      { id: '2026-01-02-030408', contentType: 'chat', title: '議論' },
      { id: '2026-01-02-030409', contentType: 'memo', title: '追加' },
    ]);
    expect(updated).toBe([
      'P', '=', '# 状態', '進行中',
      '# 対象',
      '[gdrive:2026-01-02-030405]: 資料',
      '[link:2026-01-02-030406]: リンク',
      '[memo:2026-01-02-030409]: 追加',
      'https://example.com/',
      '"C:\\docs\\plan.md"',
      '[Google:検索語]',
      '# AI議論', '[chat:2026-01-02-030408]',
    ].join('\n'));
  });

  it('# 対象 を更新しても、項目値の終端となる空行以降の自由記載を書き換えない', () => {
    const freeRef = '2026-01-02-039999';
    const content = [
      'P', '=', '# 対象', '[memo:2026-01-02-030405]: 旧', '# 条件', '条件値', '',
      '自由記載', `[memo:${freeRef}]: 本文中の例`, '自由な本文',
    ].join('\n');
    const updated = updateProjectTargets(content, [
      { id: '2026-01-02-030406', contentType: 'memo', title: '新' },
    ]);

    expect(updated).toContain('# 対象\n[memo:2026-01-02-030406]: 新\n# 条件');
    expect(updated).toContain(`\n\n自由記載\n[memo:${freeRef}]: 本文中の例\n自由な本文`);
    expect(parseProject(updated).ids).toEqual(['2026-01-02-030406']);
  });

  it('# 対象 が無い旧形式へ追加するときも、自由記載を残す', () => {
    const content = 'P\n* 2026-01-02-030405\n\n# 自由記載\n消さない本文';
    const updated = updateProjectTargets(content, [
      { id: '2026-01-02-030406', contentType: 'memo', title: '新' },
    ]);

    expect(updated).toContain('# 対象\n[memo:2026-01-02-030406]: 新');
    expect(updated).toContain('\n\n# 自由記載\n消さない本文');
    expect(parseProject(updated).ids).toEqual(['2026-01-02-030406']);
  });

  it('タイトル付きThinkタグ形式（[memo:ID]: タイトル）も parse できる', () => {
    const content = [
      'プロジェクトA',
      '=',
      '# 対象',
      '[memo:2026-01-02-030405]: 設計メモ',
      'https://example.com',
      '[gmail:18f3abc]: メール件名',
      '[chat:2026-01-02-030406]: 相談履歴',
    ].join('\n');
    const parsed = parseProject(content);
    expect(parsed.title).toBe('プロジェクトA');
    expect(parsed.ids).toEqual(['2026-01-02-030405', '2026-01-02-030406']);
  });

  it('廃止したフィルター式・検索式・除外行をメンバー指定として扱わない', () => {
    const parsed = parseProject('束\n> Keyword：設計\n> 作成日：2026-01-01,@7d\n>> 検索語：本文\n- 2026-01-02-030406\n* 2026-01-02-030405');
    expect(parsed.ids).toEqual(['2026-01-02-030405']);
  });

  // ── D-5（対応済み 2026-08-31）────────────────────────────────────────
  it('サフィックス付き ID（AI 生成の -memo / 衝突回避の -a3f9 等）を ID として認識する', () => {
    const parsed = parseProject('束\n* 2026-07-01-232001-memo\n* 2026-07-01-232002-a3f9');
    expect(parsed.ids).toEqual(['2026-07-01-232001-memo', '2026-07-01-232002-a3f9']);
  });

  it('角括弧付きの ID 行も許容する', () => {
    const parsed = parseProject('束\n* [2026-07-01-232001-memo]');
    expect(parsed.ids).toEqual(['2026-07-01-232001-memo']);
  });

  it('ID形式でない `* 行` は無視し、フィルタ語にも流用しない', () => {
    const parsed = parseProject('束\n* 設計メモ\n* thinktank\n* __tt_ui_state__\n* 2026-07-01-232001\n* 2015-03-09-133514-LAPTOP-5FOVA1SU');
    expect(parsed.ids).toEqual(['2026-07-01-232001', '2015-03-09-133514-LAPTOP-5FOVA1SU']);
  });
});

describe('# 対象 の「*」（全ファイル対象）', () => {
  it('# 対象 の直後が「*」だけのときに全ファイル対象とみなす', () => {
    expect(targetsAllThinks('P\n=\n# 対象\n*\n[memo:2026-01-02-030405]')).toBe(true);
    expect(targetsAllThinks('P\n=\n# 対象\n\n  *  \n# AI議論')).toBe(false);
    expect(targetsAllThinks('P\n=\n# 対象\n[memo:2026-01-02-030405]\n*')).toBe(false);
    expect(targetsAllThinks('P\n=\n# 対象\n* 2026-01-02-030405')).toBe(false);
    expect(targetsAllThinks('P\n=\n# 状態\n*')).toBe(false);
  });

  it('「*」は Think 参照ではなく、# 対象 を書き直しても1行目に残す', () => {
    const content = 'P\n=\n# 対象\n*\n[memo:2026-01-02-030405]\nhttps://example.com/\n# AI議論';
    expect(parseProject(content).ids).toEqual(['2026-01-02-030405']);
    const updated = updateProjectTargets(content, [
      { id: '2026-01-02-030405', contentType: 'memo', title: 'A' },
      { id: '2026-01-02-030406', contentType: 'memo', title: 'B' },
    ]);
    expect(updated).toBe([
      'P', '=', '# 対象', '*',
      '[memo:2026-01-02-030405]: A', '[memo:2026-01-02-030406]: B',
      'https://example.com/', '# AI議論',
    ].join('\n'));
    expect(targetsAllThinks(updated)).toBe(true);
  });
});

describe('# AIまとめ のCSVと要約の書き込み先', () => {
  const content = 'P\n=\n# 現状把握用プロンプト\n課題を挙げる\n要点だけ\n# AIまとめ\n[aiview:2026-01-02-030401], [aiview:2026-01-02-030402]\n[aiview:2026-01-02-030403]\n# AI議論\n[chat:2026-01-02-030404]\n\n# 自由記載の見出し\n[aiview:2026-01-02-999999]';

  it('1行に「,」区切りで並べた [aiview:ID] をすべて読む', () => {
    expect(parseProject(content).aiSummaryIds).toEqual(['2026-01-02-030401', '2026-01-02-030402', '2026-01-02-030403']);
    expect(parseProject(content).ids).toEqual(['2026-01-02-030401', '2026-01-02-030402', '2026-01-02-030403', '2026-01-02-030404']);
  });

  it('先頭のCSVの先頭のタグを書き込み先にする', () => {
    expect(firstAiViewId(content)).toBe('2026-01-02-030401');
    expect(firstAiViewId('P\n=\n# AIまとめ\n# AI議論')).toBeNull();
    expect(firstAiViewId('P\n=\n# 対象')).toBeNull();
  });

  it('作った AIViewファイルのタグを先頭のCSVの先頭に加える', () => {
    expect(addAiViewIdToHead(content, '2026-01-02-030409')).toContain(
      '# AIまとめ\n[aiwork:2026-01-02-030409],[aiview:2026-01-02-030401],[aiview:2026-01-02-030402]\n[aiview:2026-01-02-030403]\n# AI議論');
    expect(addAiViewIdToHead('P\n=\n# AIまとめ\n# AI議論', '2026-01-02-030409'))
      .toBe('P\n=\n# AIまとめ\n[aiwork:2026-01-02-030409]\n# AI議論');
    expect(addAiViewIdToHead('P\n=\n# 条件\n\n# AI議論\n[chat:2026-01-02-030404]', '2026-01-02-030409'))
      .toBe('P\n=\n# 条件\n# AIまとめ\n[aiwork:2026-01-02-030409]\n# AI議論\n[chat:2026-01-02-030404]');
    expect(addAiViewIdToHead('P\n=\n# 条件', '2026-01-02-030409')).toBe('P\n=\n# 条件\n# AIまとめ\n[aiwork:2026-01-02-030409]');
  });

  it('[aiwork:ID] と旧名の [aiview:ID] を同じ AIWork として読む', () => {
    const mixed = 'P\n=\n# AIまとめ\n[aiwork:2026-01-02-030401],[aiview:2026-01-02-030402]';
    expect(parseProject(mixed).aiSummaryIds).toEqual(['2026-01-02-030401', '2026-01-02-030402']);
    expect(firstAiViewId(mixed)).toBe('2026-01-02-030401');
  });

  it('見出し直後から次の見出しまでを読む', () => {
    expect(readProjectSectionText(content, '現状把握用プロンプト')).toBe('課題を挙げる\n要点だけ');
    expect(readProjectSectionText(content, '進捗把握用プロンプト')).toBe('');
  });

  it('空行で終了した項目の自由記載は解析せず、後続のProject見出しは解析する', () => {
    const parsed = parseProject(content);
    expect(parsed.ids).not.toContain('2026-01-02-999999');
    expect(parsed.aiDiscussionIds).toEqual(['2026-01-02-030404']);
  });
});
