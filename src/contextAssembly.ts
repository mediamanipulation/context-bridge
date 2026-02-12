import * as vscode from 'vscode';
import { EventLog } from './eventLog';
import { pollState } from './polledState';
import { detectPhase } from './phaseDetection';
import { ContextBundle, ActivityEvent } from './types';

export async function assembleContext(eventLog: EventLog): Promise<ContextBundle> {
  const config = vscode.workspace.getConfiguration('ctxbridge');
  const windowSec = config.get<number>('eventWindowSeconds', 60);

  // 1. Snapshot the event log
  const events = eventLog.snapshot(windowSec * 1000);

  // 2. Poll ambient state
  const state = await pollState();

  // 3. Detect workflow phase
  const phase = detectPhase(events);

  // 4. Capture current selection if any
  let selection: ContextBundle['selection'] = undefined;
  const editor = vscode.window.activeTextEditor;
  if (editor && !editor.selection.isEmpty) {
    const doc = editor.document;
    const sel = editor.selection;
    selection = {
      uri: doc.uri.toString(),
      startLine: sel.start.line + 1,
      endLine: sel.end.line + 1,
      snippet: doc.getText(new vscode.Range(sel.start, sel.end)),
      languageId: doc.languageId,
    };
  }

  return {
    version: 1,
    timestamp: new Date().toISOString(),
    eventLog: events,
    state,
    phase,
    selection,
  };
}

/**
 * Format a context bundle as compact markdown for LLM consumption.
 */
export function formatBundleForLLM(bundle: ContextBundle): string {
  const parts: string[] = [];

  // Phase header
  parts.push(`## Developer Context (${bundle.timestamp})`);
  parts.push(`**Phase**: ${bundle.phase.phase} (${Math.round(bundle.phase.confidence * 100)}% confidence)`);
  parts.push(`**Reasoning**: ${bundle.phase.reasoning}`);
  parts.push('');

  // Current editor
  if (bundle.state.activeEditor) {
    const ed = bundle.state.activeEditor;
    parts.push(`**Active file**: ${ed.uri} (${ed.languageId}, line ${ed.cursorLine}, ${ed.lineCount} lines${ed.isDirty ? ', unsaved' : ''})`);
  }

  // Selection
  if (bundle.selection) {
    const s = bundle.selection;
    parts.push(`**Selection**: ${s.uri}:${s.startLine}-${s.endLine}`);
    parts.push('```' + s.languageId);
    parts.push(s.snippet);
    parts.push('```');
  }

  // Diagnostics
  const errors = bundle.state.diagnostics.filter(d => d.severity === 'error');
  const warnings = bundle.state.diagnostics.filter(d => d.severity === 'warning');
  if (errors.length > 0 || warnings.length > 0) {
    parts.push('');
    parts.push(`**Diagnostics**: ${errors.length} errors, ${warnings.length} warnings`);
    for (const e of errors.slice(0, 10)) {
      parts.push(`  - ERROR ${e.uri}:${e.line}: ${e.message} [${e.source}]`);
    }
    for (const w of warnings.slice(0, 5)) {
      parts.push(`  - WARN ${w.uri}:${w.line}: ${w.message} [${w.source}]`);
    }
  }

  // Open tabs
  if (bundle.state.openTabs.length > 0) {
    parts.push('');
    parts.push(`**Open tabs** (${bundle.state.openTabs.length}):`);
    for (const tab of bundle.state.openTabs.slice(0, 15)) {
      const markers = [tab.isActive ? 'active' : '', tab.isDirty ? 'unsaved' : ''].filter(Boolean).join(', ');
      parts.push(`  - ${tab.uri}${markers ? ` (${markers})` : ''}`);
    }
  }

  // Git status
  if (bundle.state.gitStatus) {
    const g = bundle.state.gitStatus;
    parts.push('');
    parts.push(`**Git**: branch \`${g.branch}\` (ahead ${g.ahead}, behind ${g.behind})`);
    if (g.modified.length > 0) {
      parts.push(`  Modified: ${g.modified.join(', ')}`);
    }
    if (g.staged.length > 0) {
      parts.push(`  Staged: ${g.staged.join(', ')}`);
    }
  }

  // Breakpoints
  if (bundle.state.breakpoints.length > 0) {
    parts.push('');
    parts.push(`**Breakpoints** (${bundle.state.breakpoints.length}):`);
    for (const bp of bundle.state.breakpoints.slice(0, 10)) {
      parts.push(`  - ${bp.uri}:${bp.line}${bp.condition ? ` if ${bp.condition}` : ''}${bp.enabled ? '' : ' (disabled)'}`);
    }
  }

  // Event narrative
  if (bundle.eventLog.length > 0) {
    parts.push('');
    parts.push(`**Recent activity** (${bundle.eventLog.length} events):`);
    const now = Date.now();
    for (const event of bundle.eventLog) {
      parts.push(`  ${formatEvent(event, now)}`);
    }
  }

  return parts.join('\n');
}

function formatEvent(event: ActivityEvent, now: number): string {
  const ago = Math.round((now - event.timestamp) / 1000);
  const prefix = `${ago}s ago`;
  switch (event.kind) {
    case 'file_switch':
      return `${prefix}: switched to ${event.toUri ?? 'none'}`;
    case 'file_save':
      return `${prefix}: saved ${event.uri}`;
    case 'debug_start':
      return `${prefix}: started debug "${event.sessionName}"`;
    case 'debug_stop':
      return `${prefix}: ended debug "${event.sessionName}"`;
    case 'diagnostic_change':
      return `${prefix}: diagnostics changed (${event.totalErrors} errors, ${event.totalWarnings} warnings)`;
    case 'terminal_command_start':
      return `${prefix}: ran \`${event.commandLine}\``;
    case 'terminal_command_end':
      return `${prefix}: command finished (exit ${event.exitCode ?? '?'})`;
    case 'text_change':
      return `${prefix}: edited ${event.uri}`;
    case 'breakpoint_change':
      return `${prefix}: breakpoints changed (+${event.added} -${event.removed})`;
  }
}
