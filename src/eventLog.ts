import * as vscode from 'vscode';
import { RingBuffer } from './ringBuffer';
import { ActivityEvent } from './types';

const DEFAULT_BUFFER_SIZE = 200;
const TEXT_CHANGE_DEBOUNCE_MS = 2000;

export class EventLog {
  private buffer: RingBuffer<ActivityEvent>;
  private disposables: vscode.Disposable[] = [];
  private lastActiveUri: string | null = null;
  private textChangeTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(bufferSize?: number) {
    const config = vscode.workspace.getConfiguration('ctxbridge');
    const size = bufferSize ?? config.get<number>('eventBufferSize', DEFAULT_BUFFER_SIZE);
    this.buffer = new RingBuffer<ActivityEvent>(size);

    if (vscode.window.activeTextEditor) {
      this.lastActiveUri = vscode.window.activeTextEditor.document.uri.toString();
    }
  }

  start(): void {
    // 1. File switches
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        const toUri = editor?.document.uri.toString() ?? null;
        const toLang = editor?.document.languageId ?? null;
        if (toUri === this.lastActiveUri) { return; }
        this.buffer.push({
          kind: 'file_switch',
          timestamp: Date.now(),
          fromUri: this.lastActiveUri,
          toUri,
          toLanguageId: toLang,
        });
        this.lastActiveUri = toUri;
      })
    );

    // 2. Saves
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        this.buffer.push({
          kind: 'file_save',
          timestamp: Date.now(),
          uri: doc.uri.toString(),
          languageId: doc.languageId,
        });
      })
    );

    // 3. Debug sessions
    this.disposables.push(
      vscode.debug.onDidStartDebugSession((session) => {
        this.buffer.push({
          kind: 'debug_start',
          timestamp: Date.now(),
          sessionName: session.name,
          sessionType: session.type,
        });
      })
    );
    this.disposables.push(
      vscode.debug.onDidTerminateDebugSession((session) => {
        this.buffer.push({
          kind: 'debug_stop',
          timestamp: Date.now(),
          sessionName: session.name,
          sessionType: session.type,
        });
      })
    );

    // 4. Diagnostics
    this.disposables.push(
      vscode.languages.onDidChangeDiagnostics((event) => {
        const allDiags = vscode.languages.getDiagnostics();
        let totalErrors = 0;
        let totalWarnings = 0;
        for (const [, diags] of allDiags) {
          for (const d of diags) {
            if (d.severity === vscode.DiagnosticSeverity.Error) { totalErrors++; }
            else if (d.severity === vscode.DiagnosticSeverity.Warning) { totalWarnings++; }
          }
        }
        this.buffer.push({
          kind: 'diagnostic_change',
          timestamp: Date.now(),
          uris: event.uris.map(u => u.toString()),
          totalErrors,
          totalWarnings,
        });
      })
    );

    // 5. Terminal command execution (shell integration)
    this.disposables.push(
      vscode.window.onDidStartTerminalShellExecution((event) => {
        this.buffer.push({
          kind: 'terminal_command_start',
          timestamp: Date.now(),
          commandLine: event.execution.commandLine.value,
          terminalName: event.terminal.name,
        });
      })
    );
    this.disposables.push(
      vscode.window.onDidEndTerminalShellExecution((event) => {
        this.buffer.push({
          kind: 'terminal_command_end',
          timestamp: Date.now(),
          commandLine: event.execution.commandLine.value,
          terminalName: event.terminal.name,
          exitCode: event.exitCode,
        });
      })
    );

    // 6. Text changes (debounced per file)
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.contentChanges.length === 0) { return; }
        const uri = event.document.uri.toString();
        const existing = this.textChangeTimers.get(uri);
        if (existing) { clearTimeout(existing); }
        const changeCount = event.contentChanges.length;
        this.textChangeTimers.set(uri, setTimeout(() => {
          this.buffer.push({
            kind: 'text_change',
            timestamp: Date.now(),
            uri,
            changeCount,
          });
          this.textChangeTimers.delete(uri);
        }, TEXT_CHANGE_DEBOUNCE_MS));
      })
    );

    // 7. Breakpoint changes
    this.disposables.push(
      vscode.debug.onDidChangeBreakpoints((event) => {
        this.buffer.push({
          kind: 'breakpoint_change',
          timestamp: Date.now(),
          added: event.added.length,
          removed: event.removed.length,
          changed: event.changed.length,
        });
      })
    );
  }

  /** Get events from the last N milliseconds. Default: 60 seconds. */
  snapshot(windowMs: number = 60_000): ActivityEvent[] {
    return this.buffer.since(windowMs);
  }

  /** Get all events in the buffer. */
  all(): ActivityEvent[] {
    return this.buffer.toArray();
  }

  dispose(): void {
    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];
    for (const timer of this.textChangeTimers.values()) { clearTimeout(timer); }
    this.textChangeTimers.clear();
  }
}
