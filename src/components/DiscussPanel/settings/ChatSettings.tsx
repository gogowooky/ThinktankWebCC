import { TTApplication } from '../../../views/TTApplication';
import { SupportChat } from '../../ThoughtSupport/SupportChat';
import { SquareX, Save, ArrowDownAZ, LayoutList, ListRestart } from 'lucide-react';
import { ColumnSortDialog } from '../../ThinktankPanel/ColumnSortDialog';
import { FilterSelectDialog } from '../../ThinktankPanel/FilterSelectDialog';
import { ThinktankChatMemoPicker } from '../../ThinktankPanel/ThinktankChatMemoPicker';
import type { DiscussSettingsContext } from './types';

type Props = Pick<DiscussSettingsContext,
  'panel'
  | 'vault'
  | 'onRefresh'
  | 'aiChatViewRef'
  | 'selectedTodoMemoId'
  | 'columns'
  | 'setColumns'
  | 'sort'
  | 'setSort'
  | 'showColumnDialog'
  | 'setShowColumnDialog'
  | 'filterVisibility'
  | 'setFilterVisibility'
  | 'showFilterSelectDialog'
  | 'setShowFilterSelectDialog'
  | 'todoMemoThinks'
  | 'supportListError'
  | 'handleSelectTodoMemo'
  | 'handleToggleColumnDialog'
  | 'handleToggleFilterSelectDialog'
>;

export function ChatSettings({
  panel,
  vault,
  onRefresh,
  aiChatViewRef,
  selectedTodoMemoId,
  columns,
  setColumns,
  sort,
  setSort,
  showColumnDialog,
  setShowColumnDialog,
  filterVisibility,
  setFilterVisibility,
  showFilterSelectDialog,
  setShowFilterSelectDialog,
  todoMemoThinks,
  supportListError,
  handleSelectTodoMemo,
  handleToggleColumnDialog,
  handleToggleFilterSelectDialog,
}: Props) {
  return (<div className="discuss-setting-area__chat">
    <div className="discuss-setting-area__chat-toolbar">
      <button
        className="discuss-setting-area__chat-btn"
        disabled={true}
        data-tip="会話履歴は閲覧専用です"
      >
        <Save size={14} className="ws-icon" />
      </button>

      <div className="discuss-setting-area__chat-sep" />

      <button
        className="discuss-setting-area__chat-btn"
        onClick={onRefresh}
        data-tip="表示更新"
      >
        <ListRestart size={14} className="ws-icon" />
      </button>
      <button
        className={`discuss-setting-area__chat-btn${showColumnDialog ? ' discuss-setting-area__chat-btn--active' : ''}`}
        onClick={handleToggleColumnDialog}
        data-tip="表示項目とソート"
      >
        <ArrowDownAZ size={14} className="ws-icon" />
      </button>
      <button
        className={`discuss-setting-area__chat-btn${showFilterSelectDialog ? ' discuss-setting-area__chat-btn--active' : ''}`}
        onClick={handleToggleFilterSelectDialog}
        data-tip="フィルター選択"
      >
        <LayoutList size={14} className="ws-icon" />
      </button>
      <button
        className="discuss-setting-area__chat-btn"
        onClick={() => handleSelectTodoMemo('')}
        data-tip="アイテム選択をクリア"
      >
        <SquareX size={14} className="ws-icon" />
      </button>
    </div>

    {showColumnDialog && (
      <ColumnSortDialog
        columns={columns}
        sort={sort}
        onColumnsChange={setColumns}
        onSortChange={setSort}
        onClose={() => setShowColumnDialog(false)}
      />
    )}
    {showFilterSelectDialog && (
      <FilterSelectDialog
        visibility={filterVisibility}
        onChange={setFilterVisibility}
        hiddenFields={['type']}
        onClose={() => setShowFilterSelectDialog(false)}
      />
    )}

    {supportListError && <p role="alert">{supportListError}</p>}
    <ThinktankChatMemoPicker
      thinks={todoMemoThinks}
      vault={vault}
      columns={columns}
      sort={sort}
      filterVisibility={filterVisibility}
      selectedId={selectedTodoMemoId}
      onSelect={handleSelectTodoMemo}
      checkedIds={panel.CheckedThoughtIDs}
      onToggleCheck={(id, force) => panel.ToggleCheck(id, force)}
    />
    <div className="discuss-setting-area__chat-body">
      <SupportChat ref={aiChatViewRef} vault={vault} panelName="Discuss"
        selectedId={selectedTodoMemoId} bundleId={TTApplication.Instance.SeedsPanel.BundleID}
        modelSelector={{ value: { provider: panel.SettingAIChatProvider, model: panel.SettingAIChatModel }, onChange: selection => panel.SetSettingAIChatModel(selection) }} />
    </div>
  </div>);
}
