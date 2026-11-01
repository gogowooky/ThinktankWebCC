/**
 * ProjectListFilters.tsx
 * Think一覧（Thinktank / Seeds）で、種別が project だけのときに「種別」の下へ出す「状態」「見通し」の絞り込み欄。
 * 判定は useProjectStatusFilter が持つ。
 */

import {
  Circle, CirclePlay, CirclePause, CircleMinus, CircleCheck, CircleX, CircleDashed, PocketKnife,
  Telescope, Globe, House, Package, Clapperboard, Dot, type LucideIcon,
} from 'lucide-react';
import { FilterRow } from './ChatListFilters';
import { PROJECT_OUTLOOKS, PROJECT_STATES } from '../../utils/thinkFormat';

// PROJECT_STATES / PROJECT_OUTLOOKS と同じ並び
const stateIcons: LucideIcon[] = [Circle, CirclePlay, CirclePause, CircleMinus, CircleCheck, CircleX, CircleDashed, PocketKnife];
const outlookIcons: LucideIcon[] = [Telescope, Globe, House, Package, Clapperboard, Dot];

interface Props {
  states:            Set<string>;
  outlooks:          Set<string>;
  onStatesChange:    (values: Set<string>) => void;
  onOutlooksChange:  (values: Set<string>) => void;
}

export function ProjectListFilters({ states, outlooks, onStatesChange, onOutlooksChange }: Props) {
  return <>
    <FilterRow subject="Project" label="状態" values={PROJECT_STATES} icons={stateIcons}
      selected={states} onChange={onStatesChange} />
    <FilterRow subject="Project" label="見通し" values={PROJECT_OUTLOOKS} icons={outlookIcons}
      selected={outlooks} onChange={onOutlooksChange} />
  </>;
}
