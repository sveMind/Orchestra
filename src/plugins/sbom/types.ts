export type SbomComponentScope = 'runtime' | 'development' | 'optional' | 'unknown';

export type SbomComponent = {
  name: string;
  version: string | null;
  ecosystem: SbomEcosystem;
  purl: string;
  cpe?: string;
  license?: string | null;
  description?: string;
  homepage?: string;
  sourceFileRel: string;
  scope: SbomComponentScope;
  authors?: string[];
  direct: boolean;
  declaredDependencies?: Array<{ name: string; versionSpec?: string }>;
  extra?: Record<string, string | string[] | null | undefined>;
};

export type SbomEcosystem =
  | 'npm'
  | 'pnpm'
  | 'yarn'
  | 'pip'
  | 'poetry'
  | 'pipenv'
  | 'conda'
  | 'go'
  | 'cargo'
  | 'gem'
  | 'composer'
  | 'maven'
  | 'gradle'
  | 'nuget'
  | 'unknown';

export type SbomAggregateStats = {
  totalComponents: number;
  uniqueComponents: number;
  byEcosystem: Partial<Record<SbomEcosystem, number>>;
  byScope: Partial<Record<SbomComponentScope, number>>;
  withLicenses: number;
  sources: Array<{ fileRel: string; ecosystem: SbomEcosystem; count: number }>;
  unknownVersionCount: number;
};

export type SbomDocument = {
  generatedAt: string;
  tool: { name: 'orchestra-sbom'; version: '1.0.0'; vendor: 'orchestra' };
  rootName: string;
  rootVersion?: string;
  components: SbomComponent[];
  stats: SbomAggregateStats;
  errors: Array<{ sourceRel: string; message: string }>;
};

export type SbomAggregateOpts = {
  includeNestedNodeModules?: boolean;
  includeTestDependencies?: boolean;
  preferLockfileVersions?: boolean;
};

export const DEFAULT_AGGREGATE_OPTS: Required<SbomAggregateOpts> = {
  includeNestedNodeModules: false,
  includeTestDependencies: true,
  preferLockfileVersions: true
};

export type SbomMode = 'report' | 'issue' | 'comment' | 'issues-per-component';
