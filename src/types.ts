export type DepthZone = 'sunlight' | 'twilight' | 'abyssal' | 'epipelagic' | 'mesopelagic';

export type NodeKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'test'
  | 'entrypoint'
  | 'file'
  | 'community'
  | 'adr'
  | 'incident'
  | 'pattern'
  | 'entity'
  | 'architecture';

export type RelationType =
  | 'calls'
  | 'imports'
  | 'implements'
  | 'mitigates'
  | 'depends_on'
  | 'supersedes'
  | 'tensions_with'
  | 'caused_by'
  | 'verified_by'
  | 'mentions'
  | 'shares_scope_with'
  | 'tests_for'
  | 'tested_by'
  | 'governed_by'
  | 'belongs_to';

export type ConfidenceTier = 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';

export type EnforcementLevel = 'blocking' | 'warning' | 'advisory';

export type NoteStatus = 'active' | 'proposed' | 'deprecated' | 'superseded' | 'stale';

export interface NodeRecord {
  id: string;
  depth_zone: DepthZone;
  kind: NodeKind;
  name: string;
  qualified_name?: string | null;
  file_path?: string | null;
  line_start?: number | null;
  line_end?: number | null;
  signature?: string | null;
  docstring?: string | null;
  code_excerpt?: string | null;
  content_hash?: string | null;
  is_exported?: number;
  is_entrypoint?: number;
  community_id?: number | null;
  pagerank_score?: number;
  in_degree?: number;
  out_degree?: number;
  is_bridge?: number;
  summary?: string;
  status?: NoteStatus;
  enforcement?: EnforcementLevel;
  applies_to_json?: string;
  symbols_json?: string;
  invariants_json?: string;
  sources_json?: string;
  body_markdown?: string | null;
  updated_at?: string;
}

export interface EdgeRecord {
  source_id: string;
  target_id: string;
  relation: RelationType;
  confidence?: ConfidenceTier;
  weight?: number;
  context_snippet?: string | null;
  needs_review?: number;
}

export interface CommunityRecord {
  id: number;
  name: string;
  cohesion: number;
  size: number;
  dominant_language?: string | null;
  god_node_id?: string | null;
  description?: string | null;
}

export interface FileStateRecord {
  file_path: string;
  mtime_ms: number;
  sha256: string;
  byte_size: number;
  kind: 'code' | 'markdown';
  last_synced_at?: string;
}

export interface FlowRecord {
  id: string;
  name: string;
  entrypoint_id: string;
  terminal_ids_json: string;
  node_path_json: string;
  depth: number;
  crosses_communities: number;
  criticality_score: number;
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface BlastRadiusResult {
  entry_files: string[];
  affected_files: string[];
  blocking_invariants: Array<{
    adr_id: string;
    title: string;
    enforcement: EnforcementLevel;
    invariant: string;
  }>;
  risk_score: number;
  risk_level: RiskLevel;
  affected_nodes: Array<{
    id: string;
    name: string;
    kind: NodeKind;
    file_path: string;
    line_start?: number | null;
    line_end?: number | null;
    signature?: string | null;
    code_excerpt?: string | null;
    confidence?: ConfidenceTier;
  }>;
  affected_flows: Array<{
    id: string;
    name: string;
    depth: number;
    criticality_score: number;
    path: string[];
  }>;
  covering_tests: string[];
  untested_functions: Array<{
    id: string;
    name: string;
    file_path: string;
    line_start?: number | null;
  }>;
  governing_adrs: Array<{
    id: string;
    title: string;
    summary: string;
    enforcement: EnforcementLevel;
    invariants: string[];
    stale_warning: boolean;
  }>;
  known_incidents: Array<{
    id: string;
    title: string;
    warning: string;
  }>;
}
