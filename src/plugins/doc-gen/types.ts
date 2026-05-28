import type { RepoSignals, NativeBuildKind } from '../../services/repoScan';

export type DocGenMode = 'changed' | 'all' | 'structure';

export type StructurePlanItem = {
  topic:
    | 'requirements'
    | 'environment'
    | 'local-setup'
    | 'architecture'
    | 'api'
    | 'pipelines'
    | 'docker'
    | 'deployment'
    | 'nginx'
    | 'kubernetes'
    | 'helm'
    | 'terraform'
    | 'openapi'
    | 'build'
    | 'security'
    | 'testing'
    | 'contributing'
    | 'changelog';
  title: string;
  desiredPath?: string;
};

export type { RepoSignals, NativeBuildKind };
