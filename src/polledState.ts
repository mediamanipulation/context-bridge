import * as vscode from 'vscode';
import {
  EditorState, TabInfo, DiagnosticInfo,
  BreakpointInfo, GitStatus, PolledState
} from './types';

export async function pollState(): Promise<PolledState> {
  const [
    activeEditor,
    openTabs,
    diagnostics,
    breakpoints,
    gitStatus,
  ] = await Promise.all([
    Promise.resolve(pollActiveEditor()),
    Promise.resolve(pollOpenTabs()),
    Promise.resolve(pollDiagnostics()),
    Promise.resolve(pollBreakpoints()),
    pollGitStatus(),
  ]);

  const dirtyFiles = openTabs
    .filter(t => t.isDirty)
    .map(t => t.uri);

  const workspaceFolders = (vscode.workspace.workspaceFolders ?? [])
    .map(f => f.uri.toString());

  return {
    activeEditor,
    openTabs,
    dirtyFiles,
    diagnostics,
    breakpoints,
    gitStatus,
    workspaceFolders,
  };
}

function pollActiveEditor(): EditorState | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { return null; }
  const doc = editor.document;
  const sel = editor.selection;
  const visibleRanges = editor.visibleRanges;
  return {
    uri: doc.uri.toString(),
    languageId: doc.languageId,
    cursorLine: sel.active.line + 1,
    cursorColumn: sel.active.character + 1,
    selectionText: sel.isEmpty ? '' : doc.getText(new vscode.Range(sel.start, sel.end)),
    selectionStartLine: sel.start.line + 1,
    selectionEndLine: sel.end.line + 1,
    visibleRangeStart: visibleRanges.length > 0 ? visibleRanges[0].start.line + 1 : 1,
    visibleRangeEnd: visibleRanges.length > 0 ? visibleRanges[visibleRanges.length - 1].end.line + 1 : 1,
    lineCount: doc.lineCount,
    isDirty: doc.isDirty,
  };
}

function pollOpenTabs(): TabInfo[] {
  const tabs: TabInfo[] = [];
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputText) {
        tabs.push({
          uri: tab.input.uri.toString(),
          label: tab.label,
          isDirty: tab.isDirty,
          isActive: tab.isActive,
          isPinned: tab.isPinned,
        });
      }
    }
  }
  return tabs;
}

function pollDiagnostics(): DiagnosticInfo[] {
  const config = vscode.workspace.getConfiguration('ctxbridge');
  const maxDiagnostics = config.get<number>('maxDiagnosticsInContext', 50);

  const allDiags = vscode.languages.getDiagnostics();
  const result: DiagnosticInfo[] = [];

  for (const [uri, diags] of allDiags) {
    for (const d of diags) {
      if (d.severity > vscode.DiagnosticSeverity.Warning) { continue; }
      result.push({
        uri: uri.toString(),
        severity: d.severity === vscode.DiagnosticSeverity.Error ? 'error' : 'warning',
        message: d.message,
        line: d.range.start.line + 1,
        source: d.source ?? 'unknown',
      });
      if (result.length >= maxDiagnostics) { return result; }
    }
  }
  return result;
}

function pollBreakpoints(): BreakpointInfo[] {
  return vscode.debug.breakpoints
    .filter((bp): bp is vscode.SourceBreakpoint => bp instanceof vscode.SourceBreakpoint)
    .map(bp => ({
      uri: bp.location.uri.toString(),
      line: bp.location.range.start.line + 1,
      enabled: bp.enabled,
      condition: bp.condition,
    }));
}

async function pollGitStatus(): Promise<GitStatus | null> {
  const gitExtension = vscode.extensions.getExtension('vscode.git');
  if (!gitExtension) { return null; }

  if (!gitExtension.isActive) {
    try {
      await gitExtension.activate();
    } catch {
      return null;
    }
  }

  const git = gitExtension.exports?.getAPI?.(1);
  if (!git || git.repositories.length === 0) { return null; }

  const repo = git.repositories[0];
  const head = repo.state.HEAD;

  return {
    branch: head?.name ?? 'detached',
    ahead: head?.ahead ?? 0,
    behind: head?.behind ?? 0,
    staged: repo.state.indexChanges.map((c: any) => c.uri.fsPath),
    modified: repo.state.workingTreeChanges.map((c: any) => c.uri.fsPath),
    untracked: repo.state.workingTreeChanges
      .filter((c: any) => c.status === 7)
      .map((c: any) => c.uri.fsPath),
  };
}
