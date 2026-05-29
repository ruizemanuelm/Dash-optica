import { BRANCH_IDS } from './api';

export type BranchKey =
  | 'general'
  | 'norte'
  | 'sur'
  | 'anexo'
  | 'yerbaBuena';

export interface BranchMeta {
  name: string;
  shortName: string;
  code: string;
  color: string;
  apiId: string;
}

export const branches: Record<BranchKey, BranchMeta> = {
  general:    { name: 'Todas las sucursales', shortName: 'General',  code: 'GL', color: '#38bdf8', apiId: '' },
  norte:      { name: 'Barrio Norte',         shortName: 'B. Norte', code: 'BN', color: '#38bdf8', apiId: BRANCH_IDS.norte },
  sur:        { name: 'Barrio Sur',           shortName: 'B. Sur',   code: 'BS', color: '#818cf8', apiId: BRANCH_IDS.sur },
  anexo:      { name: 'Anexo',               shortName: 'Anexo',    code: 'AN', color: '#fb923c', apiId: BRANCH_IDS.anexo },
  yerbaBuena: { name: 'Yerba Buena',          shortName: 'Y. Buena', code: 'YB', color: '#34d399', apiId: BRANCH_IDS.yerbaBuena },
};

export const branchOrder: BranchKey[] = ['general', 'norte', 'sur', 'anexo', 'yerbaBuena'];

export const activeBranches: BranchKey[] = ['norte', 'sur', 'anexo', 'yerbaBuena'];
