import { ActivityEvent, WorkflowPhase, PhaseAssessment } from './types';

export function detectPhase(events: ActivityEvent[]): PhaseAssessment {
  if (events.length < 3) {
    return { phase: 'unknown', confidence: 0, reasoning: 'Insufficient activity', recentFiles: [] };
  }

  const scores: Record<WorkflowPhase, number> = {
    exploring: 0,
    iterating: 0,
    building: 0,
    debugging: 0,
    archaeology: 0,
    unknown: 0,
  };

  const fileSwitches = events.filter(e => e.kind === 'file_switch');
  const textChanges = events.filter(e => e.kind === 'text_change');
  const saves = events.filter(e => e.kind === 'file_save');
  const debugStarts = events.filter(e => e.kind === 'debug_start');
  const debugStops = events.filter(e => e.kind === 'debug_stop');
  const terminalCmds = events.filter(e => e.kind === 'terminal_command_start');
  const diagnosticChanges = events.filter(e => e.kind === 'diagnostic_change');
  const breakpointChanges = events.filter(e => e.kind === 'breakpoint_change');

  const uniqueFiles = new Set<string>();
  for (const e of fileSwitches) {
    if (e.kind === 'file_switch') {
      if (e.fromUri) { uniqueFiles.add(e.fromUri); }
      if (e.toUri) { uniqueFiles.add(e.toUri); }
    }
  }
  for (const e of textChanges) {
    if (e.kind === 'text_change') { uniqueFiles.add(e.uri); }
  }

  // --- Exploring: many file switches, few edits ---
  if (fileSwitches.length >= 4 && textChanges.length <= 1) {
    scores.exploring += 3;
  }
  if (uniqueFiles.size >= 3 && textChanges.length === 0) {
    scores.exploring += 2;
  }

  // --- Iterating: edits + saves + test/build runs ---
  if (textChanges.length >= 2 && saves.length >= 1) {
    scores.iterating += 2;
  }
  const testCommands = terminalCmds.filter(e =>
    e.kind === 'terminal_command_start' &&
    /\b(test|jest|mocha|pytest|cargo\s+test|npm\s+test|npm\s+run\s+test)\b/i.test(e.commandLine)
  );
  if (testCommands.length >= 1 && textChanges.length >= 1) {
    scores.iterating += 3;
  }
  if (diagnosticChanges.length >= 2) {
    scores.iterating += 1;
  }

  // --- Building: many edits, focused on few files ---
  if (textChanges.length >= 3 && fileSwitches.length <= 2) {
    scores.building += 3;
  }
  if (saves.length >= 2 && textChanges.length >= 2 && fileSwitches.length <= 1) {
    scores.building += 2;
  }

  // --- Debugging: debug session active, breakpoints ---
  if (debugStarts.length > debugStops.length) {
    scores.debugging += 4;
  }
  if (breakpointChanges.length >= 1) {
    scores.debugging += 2;
  }
  if (debugStarts.length >= 1) {
    scores.debugging += 1;
  }

  // --- Archaeology: git history commands ---
  const gitHistoryCommands = terminalCmds.filter(e =>
    e.kind === 'terminal_command_start' &&
    /\bgit\s+(blame|log|diff|show|annotate)\b/i.test(e.commandLine)
  );
  if (gitHistoryCommands.length >= 1) {
    scores.archaeology += 3;
  }
  if (fileSwitches.length >= 3 && textChanges.length === 0 && gitHistoryCommands.length >= 1) {
    scores.archaeology += 2;
  }

  // Find winner
  let bestPhase: WorkflowPhase = 'unknown';
  let bestScore = 0;
  for (const [phase, score] of Object.entries(scores) as [WorkflowPhase, number][]) {
    if (score > bestScore) {
      bestScore = score;
      bestPhase = phase;
    }
  }

  const confidence = Math.min(1, bestScore / 5);
  const reasoning = generateReasoning(bestPhase, events, uniqueFiles);

  return {
    phase: bestPhase,
    confidence: Math.round(confidence * 100) / 100,
    reasoning,
    recentFiles: Array.from(uniqueFiles).slice(0, 5),
  };
}

function generateReasoning(
  phase: WorkflowPhase,
  events: ActivityEvent[],
  files: Set<string>,
): string {
  const fileCount = files.size;
  const editCount = events.filter(e => e.kind === 'text_change').length;
  const switchCount = events.filter(e => e.kind === 'file_switch').length;

  switch (phase) {
    case 'exploring':
      return `Navigated across ${fileCount} files with ${switchCount} switches and minimal edits (${editCount})`;
    case 'iterating':
      return `Making edits (${editCount}) and running tests/builds across ${fileCount} files`;
    case 'building':
      return `Actively writing code with ${editCount} edit bursts, focused on ${fileCount} files`;
    case 'debugging':
      return `Debug session active with breakpoint activity across ${fileCount} files`;
    case 'archaeology':
      return `Browsing git history and navigating ${fileCount} files without edits`;
    default:
      return `Activity pattern unclear (${events.length} events, ${fileCount} files)`;
  }
}
