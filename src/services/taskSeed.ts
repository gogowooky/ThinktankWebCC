import type { ThinkValues } from '../../shared/contracts/thinkSupportRecord';

export type TaskSeed = Pick<ThinkValues, 'goal' | 'completionCriteria'>;
