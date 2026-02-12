// --- Event Types ---

export type EventKind =
  | 'file_switch'
  | 'file_save'
  | 'debug_start'
  | 'debug_stop'
  | 'diagnostic_change'
  | 'terminal_command_start'
  | 'terminal_command_end'
  | 'text_change'
  | 'breakpoint_change';

export interface BaseEvent {
  kind: EventKind;
  timestamp: number; // Date.now()
}

export interface FileSwitchEvent extends BaseEvent {
  kind: 'file_switch';
  fromUri: string | null;
  toUri: string | null;
  toLanguageId: string | null;
}

export interface FileSaveEvent extends BaseEvent {
  kind: 'file_save';
  uri: string;
  languageId: string;
}

export interface DebugStartEvent extends BaseEvent {
  kind: 'debug_start';
  sessionName: string;
  sessionType: string;
}

export interface DebugStopEvent extends BaseEvent {
  kind: 'debug_stop';
  sessionName: string;
  sessionType: string;
}

export interface DiagnosticChangeEvent extends BaseEvent {
  kind: 'diagnostic_change';
  uris: string[];
  totalErrors: number;
  totalWarnings: number;
}

export interface TerminalCommandStartEvent extends BaseEvent {
  kind: 'terminal_command_start';
  commandLine: string;
  terminalName: string;
}

export interface TerminalCommandEndEvent extends BaseEvent {
  kind: 'terminal_command_end';
  commandLine: string;
  terminalName: string;
  exitCode: number | undefined;
}

export interface TextChangeEvent extends BaseEvent {
  kind: 'text_change';
  uri: string;
  changeCount: number;
}

export interface BreakpointChangeEvent extends BaseEvent {
  kind: 'breakpoint_change';
  added: number;
  removed: number;
  changed: number;
}

export type ActivityEvent =
  | FileSwitchEvent
  | FileSaveEvent
  | DebugStartEvent
  | DebugStopEvent
  | DiagnosticChangeEvent
  | TerminalCommandStartEvent
  | TerminalCommandEndEvent
  | TextChangeEvent
  | BreakpointChangeEvent;

// --- Polled State Types ---

export interface EditorState {
  uri: string;
  languageId: string;
  cursorLine: number;
  cursorColumn: number;
  selectionText: string;
  selectionStartLine: number;
  selectionEndLine: number;
  visibleRangeStart: number;
  visibleRangeEnd: number;
  lineCount: number;
  isDirty: boolean;
}

export interface TabInfo {
  uri: string;
  label: string;
  isDirty: boolean;
  isActive: boolean;
  isPinned: boolean;
}

export interface DiagnosticInfo {
  uri: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  line: number;
  source: string;
}

export interface BreakpointInfo {
  uri: string;
  line: number;
  enabled: boolean;
  condition?: string;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  untracked: string[];
}

export interface PolledState {
  activeEditor: EditorState | null;
  openTabs: TabInfo[];
  dirtyFiles: string[];
  diagnostics: DiagnosticInfo[];
  breakpoints: BreakpointInfo[];
  gitStatus: GitStatus | null;
  workspaceFolders: string[];
}

// --- Workflow Phase ---

export type WorkflowPhase =
  | 'exploring'
  | 'iterating'
  | 'building'
  | 'debugging'
  | 'archaeology'
  | 'unknown';

export interface PhaseAssessment {
  phase: WorkflowPhase;
  confidence: number;
  reasoning: string;
  recentFiles: string[];
}

// --- Context Bundle ---

export interface ContextBundle {
  version: 1;
  timestamp: string;
  eventLog: ActivityEvent[];
  state: PolledState;
  phase: PhaseAssessment;
  selection?: {
    uri: string;
    startLine: number;
    endLine: number;
    snippet: string;
    languageId: string;
  };
}
