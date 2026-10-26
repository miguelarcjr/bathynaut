export type DepthZone = 'sunlight' | 'twilight' | 'abyssal';

export type NodeKind = 
  | 'function' 
  | 'class' 
  | 'file' 
  | 'community' 
  | 'adr' 
  | 'incident' 
  | 'pattern' 
  | 'entity';

export type RelationType = 
  | 'calls' 
  | 'imports' 
  | 'implements' 
  | 'mitigates' 
  | 'depends_on' 
  | 'supersedes' 
  | 'tests_for'
  | 'governed_by'
  | 'belongs_to';

export type ConfidenceTier = 'EXTRACTED' | 'INFERRED';

export interface NodeRecord {
  id: string;
  depth_zone: DepthZone;
  kind: NodeKind;
  name: string;
  file_path?: string | null;
  line_start?: number | null;
  line_end?: number | null;
  community_id?: number | null;
  pagerank_score?: number;
  summary: string;
  status?: 'active' | 'deprecated' | 'superseded';
  applies_to_json?: string; // JSON array of string globs
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
}

export interface CommunityRecord {
  id: number;
  name: string;
  cohesion: number;
  size: number;
  dominant_language?: string | null;
  description?: string | null;
}

export interface BlastRadiusResult {
  entry_files: string[];
  affected_files: string[];
  affected_nodes: Array<{ id: string; name: string; kind: NodeKind; file_path: string }>;
  covering_tests: string[];
  governing_adrs: Array<{ id: string; title: string; summary: string }>;
  known_incidents: Array<{ id: string; title: string; warning: string }>;
}
