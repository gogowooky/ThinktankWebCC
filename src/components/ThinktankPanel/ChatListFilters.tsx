import { CheckSquare, FolderKanban, CircleHelp, CalendarDays, Repeat, MessageCircle, Circle, Play, Hourglass, Pause, CircleCheck, CircleX, CircleDashed, SquareCheck, X, type LucideIcon } from 'lucide-react';
import { parseManagedChatTitle } from '../../utils/managedChat';
import './ThinktankSearchBar.css';

export const CHAT_KINDS = ['TODO', 'PROJ', 'ASK', 'EVNT', 'LOOP', '未分類'] as const;
export const CHAT_STATES = ['未着手', '進行中', '待機', '保留', '完了', '中止', '状態未設定'] as const;
const kindIcons: LucideIcon[] = [CheckSquare, FolderKanban, CircleHelp, CalendarDays, Repeat, MessageCircle];
const stateIcons: LucideIcon[] = [Circle, Play, Hourglass, Pause, CircleCheck, CircleX, CircleDashed];
const kindLabels = ['TODO：すること', 'PROJ：プロジェクト', 'ASK：相談・質問', 'EVNT：イベント', 'LOOP：繰り返し', '未分類：種類タグなし'];

export function matchesChatFilters(name: string, kinds: Set<string>, states: Set<string>): boolean {
  const info = parseManagedChatTitle(name);
  return kinds.has(info?.kind ?? '未分類') && states.has(info?.state ?? '状態未設定');
}

interface RowProps {
  label: string; values: readonly string[]; icons: LucideIcon[]; labels?: string[];
  selected: Set<string>; current?: string; onChange: (values: Set<string>) => void;
}
function FilterRow({ label, values, icons, labels, selected, current, onChange }: RowProps) {
  const all = values.every(value => selected.has(value));
  return <div className="tt-search-bar__types" role="group" aria-label={`Chatの${label}フィルター`}>
    {values.map((value, i) => {
      const Icon = icons[i]; const active = selected.has(value); const tip = labels?.[i] ?? value;
      return <button key={value} type="button" className={`tt-search-bar__type-btn${active ? ' tt-search-bar__type-btn--active' : ''}${current === value ? ' tt-chat-filter--current' : ''}`}
        aria-current={current === value ? 'true' : undefined}
        aria-label={tip} aria-pressed={active} data-tip={tip} onClick={() => {
          const next = new Set(selected); if (active) next.delete(value); else next.add(value); onChange(next);
        }}><Icon size={14} /></button>;
    })}
    <button type="button" className="tt-search-bar__type-all tt-search-bar__type-all--right"
      aria-label={all ? `全${label}をクリア` : `全${label}を選択`} data-tip={all ? `全${label}をクリア` : `全${label}を選択`} data-tip-side="left"
      onClick={() => onChange(new Set(all ? [] : values))}>{all ? <X size={12} /> : <SquareCheck size={12} />}</button>
  </div>;
}

export function ChatListFilters({ kinds, states, onKindsChange, onStatesChange, showKinds = true, showStates = true, currentTitle }: {
  showKinds?: boolean; showStates?: boolean; currentTitle?: string;
  kinds: Set<string>; states: Set<string>; onKindsChange: (values: Set<string>) => void; onStatesChange: (values: Set<string>) => void;
}) {
  const current = currentTitle === undefined ? undefined : parseManagedChatTitle(currentTitle);
  return <>
    {showKinds && <FilterRow label="種類" values={CHAT_KINDS} icons={kindIcons} labels={kindLabels} selected={kinds} current={currentTitle === undefined ? undefined : current?.kind ?? '未分類'} onChange={onKindsChange} />}
    {showStates && <FilterRow label="状態" values={CHAT_STATES} icons={stateIcons} selected={states} current={currentTitle === undefined ? undefined : current?.state ?? '状態未設定'} onChange={onStatesChange} />}
  </>;
}
