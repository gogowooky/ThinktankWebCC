/**
 * useWorkingFileCommands.ts
 * WorkingPanel の設定エリアから呼ぶ、Thinkファイルの新規作成・読み込み・保存（メモ・HTML・chat・テーブル）。
 */
import { useCallback } from 'react';
import type { TTVault } from '../../models/TTVault';
import type { TTWorkingPanel } from '../../views/TTWorkingPanel';
import { NEW_HTML_CONTENT } from '../../utils/htmlPreview';
import { parseTableContent, sectionToCsv, tableSectionToMetadataForm, readColHeader, parseCsvLine } from '../../utils/tableFormat';
import { chatAiMetadata } from '../../services/chatAiSetting';

const NEW_WORKING_CHAT_TITLE = 'ASK:Working｜新しい相談';

export function useWorkingFileCommands(panel: TTWorkingPanel, vault: TTVault, seedsProjectId: string | undefined) {
  const handleCreateHtml = useCallback(async () => {
    try {
      const t = await vault.CreateBlankThink('html', NEW_HTML_CONTENT, seedsProjectId);
      panel.AddToRight(t.ID, 'html', t.Name);
    } catch (error) {
      console.error('[WorkingPanel] HTML creation failed', error);
      window.alert('HTML資料を保存できませんでした。接続を確認して再度お試しください。');
    }
  }, [vault, panel, seedsProjectId]);

  const handleCreateMemo = useCallback(async () => {
    const t = await vault.CreateBlankThink('memo', '新規メモ', seedsProjectId);
    panel.AddToRight(t.ID, 'texteditor', t.Name);
  }, [vault, panel, seedsProjectId]);

  // 作成時の Pane の AI を chatファイルの metadata に記録し、Chat モードで開く
  const handleCreateChat = useCallback(async () => {
    const selection = { provider: panel.AIChatProvider, model: panel.AIChatModel };
    const t = await vault.CreateBlankThink('chat', NEW_WORKING_CHAT_TITLE, undefined, chatAiMetadata(selection));
    panel.AddToRight(t.ID, 'chat', t.Name);
  }, [vault, panel]);

  const handleReadMemo = useCallback(() => {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = '.txt,.md,.xdoc,.html,.htm';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const title   = file.name.replace(/\.[^/.]+$/, '');
      const text    = await file.text();
      const content = `${title}\n${text}`;
      try {
        const isHtml = /\.html?$/i.test(file.name);
        const t = await vault.CreateBlankThink(isHtml ? 'html' : 'memo', content, seedsProjectId);
        panel.AddToRight(t.ID, isHtml ? 'html' : 'markdown', t.Name);
      } catch (error) {
        console.error('[WorkingPanel] import failed', error);
        window.alert('ファイルを保存できませんでした。接続を確認して再度お試しください。');
      }
    };
    input.click();
  }, [vault, panel, seedsProjectId]);

  const handleSaveMemo = useCallback(() => {
    const focusedArea = panel.FocusedAreaId ? panel.GetArea(panel.FocusedAreaId) : null;
    if (!focusedArea) return;
    const think = vault.GetThink(focusedArea.ResourceID);
    if (!think || !['memo', 'html'].includes(think.ContentType)) return;
    const isHtml = think.ContentType === 'html';
    const content = isHtml ? think.Content.split('\n').slice(1).join('\n') : think.Content;
    const blob = new Blob([content], { type: isHtml ? 'text/html;charset=utf-8' : 'text/markdown;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${think.Name}.${isHtml ? 'html' : 'md'}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [panel, vault]);

  const handleCreateTable = useCallback(async () => {
    const t = await vault.CreateBlankThink('table', '新規テーブル', seedsProjectId);
    panel.AddToRight(t.ID, 'texteditor', t.Name);
  }, [vault, panel, seedsProjectId]);

  const handleReadTable = useCallback(() => {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = '.csv,.xlsx,.xls';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const title = file.name.replace(/\.[^/.]+$/, '');

      let sections: import('../../utils/tableFormat').TableSection[] = [];

      if (file.name.toLowerCase().endsWith('.csv')) {
        const text  = await file.text();
        const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
        if (lines.length > 0) {
          const columns = parseCsvLine(lines[0]);
          const rows    = lines.slice(1).map(parseCsvLine);
          sections      = [{ title: 'データ', columns, rows, rawLines: [] }];
        }
      } else {
        // XLSX / XLS: SheetJS で読み取り
        const XLSX    = await import('xlsx');
        const buffer  = await file.arrayBuffer();
        const wb      = XLSX.read(buffer, { type: 'array' });
        for (const sheetName of wb.SheetNames) {
          const ws   = wb.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });
          if (data.length > 0) {
            const columns = data[0].map(String);
            const rows    = data.slice(1).map(r => r.map(String));
            sections.push({ title: sheetName, columns, rows, rawLines: [] });
          }
        }
      }

      if (sections.length === 0) return;
      const { content, colheader } = tableSectionToMetadataForm(title, sections[0]);
      const t = await vault.CreateBlankThink('table', title, seedsProjectId);
      t.Metadata = { ...t.Metadata, colheader };
      t.Content = content;
      await t.SaveContent();
      panel.AddToRight(t.ID, 'datagrid', t.Name);
    };
    input.click();
  }, [vault, panel, seedsProjectId]);

  const handleSaveTable = useCallback(() => {
    const focusedArea = panel.FocusedAreaId ? panel.GetArea(panel.FocusedAreaId) : null;
    if (!focusedArea) return;
    const think = vault.GetThink(focusedArea.ResourceID);
    if (!think || think.ContentType !== 'table') return;

    const sections = parseTableContent(think.Content, readColHeader(think.Metadata));
    if (sections.length === 0) return;

    for (const section of sections) {
      const csv  = '﻿' + sectionToCsv(section);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = sections.length > 1
        ? `${think.Name}_${section.title}.csv`
        : `${think.Name}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [panel, vault]);

  return {
    handleCreateHtml, handleCreateMemo, handleCreateChat, handleReadMemo, handleSaveMemo,
    handleCreateTable, handleReadTable, handleSaveTable,
  };
}
