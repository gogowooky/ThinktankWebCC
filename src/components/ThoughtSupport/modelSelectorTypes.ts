import type { AiModelSelection } from '../../services/aiModels';

export interface AiModelSelectorProps {
  value: AiModelSelection;
  onChange: (selection: AiModelSelection) => void;
}
