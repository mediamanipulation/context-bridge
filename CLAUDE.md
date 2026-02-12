# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Context Bridge is a VS Code extension that captures developer context and formats it for LLM consumption. It provides:

1. **Code reference capture** - Structured JSON payloads and markdown-formatted references with clickable links
2. **Event-driven activity log** - Rolling buffer of file switches, saves, debug sessions, terminal commands, diagnostics, and text changes
3. **Polled ambient state** - On-demand capture of editor state, open tabs, diagnostics, breakpoints, and git status
4. **Context assembly** - Packages event log + polled state into a context bundle with workflow phase detection
5. **Workflow phase detection** - Score-based pattern analysis that infers what the developer is doing (exploring, iterating, building, debugging, archaeology)

## Development Commands

```bash
npm install              # Install dependencies
npm run compile          # Compile TypeScript to out/
npm run watch            # Watch mode for development
```

### Testing the Extension
- **Debug mode**: Press F5 or Run > Start Debugging (launches Extension Development Host)
- **Package for installation**: `vsce package --no-dependencies` (creates `.vsix` file)
- **Install**: Ctrl+Shift+P > "Extensions: Install from VSIX"

## Architecture

### Module Structure

```text
src/
  extension.ts          Entry point — wires modules, registers all commands
  types.ts              Shared type definitions (events, state, context bundle, phases)
  ringBuffer.ts         Generic circular buffer (no VS Code dependency)
  eventLog.ts           Event-driven layer — VS Code listeners → ring buffer
  polledState.ts        On-demand state capture (editor, tabs, diagnostics, git)
  contextAssembly.ts    Orchestrates snapshot + poll + packaging + LLM formatting
  phaseDetection.ts     Score-based pattern analysis (no VS Code dependency)
  httpClient.ts         HTTPS POST helper for endpoint delivery
```

### Commands

#### 1. `ctxbridge.sendCodeRef` - Code Reference Payload
Creates structured JSON payload with code reference metadata (file URI, 1-indexed line numbers, snippet, language, selection kind, timestamp). Logs to Output channel; optionally POSTs to configured endpoint.

#### 2. `ctxbridge.sendToClaudeCode` - Claude Code Integration
Formats code references as markdown with clickable `file:line` links and fenced code blocks. Copies to clipboard.
**Keybinding**: `Ctrl+Shift+C` / `Cmd+Shift+C`

#### 3. `ctxbridge.assembleContext` - Developer Context Assembly
Snapshots the event log, polls ambient state, detects workflow phase, and packages everything into a context bundle. Copies formatted markdown to clipboard; optionally POSTs JSON to endpoint.
**Keybinding**: `Ctrl+Shift+A` / `Cmd+Shift+A`

#### 4. `ctxbridge.showContextJson` - Debug Context View
Opens the full context bundle as formatted JSON in a new editor tab. Useful for inspecting what the extension captures.

### Event-Driven Layer (`eventLog.ts`)

The `EventLog` class registers VS Code event listeners at activation and captures events into a `RingBuffer`:

| VS Code Event | Captured As | Notes |
| --- | --- | --- |
| `onDidChangeActiveTextEditor` | `file_switch` | Deduped against last URI |
| `onDidSaveTextDocument` | `file_save` | |
| `onDidStartDebugSession` | `debug_start` | |
| `onDidTerminateDebugSession` | `debug_stop` | |
| `onDidChangeDiagnostics` | `diagnostic_change` | Includes total error/warning counts |
| `onDidStartTerminalShellExecution` | `terminal_command_start` | Requires shell integration (VS Code 1.93+) |
| `onDidEndTerminalShellExecution` | `terminal_command_end` | Includes exit code |
| `onDidChangeTextDocument` | `text_change` | Debounced 2s per file |
| `onDidChangeBreakpoints` | `breakpoint_change` | Counts added/removed/changed |

### Polled State Layer (`polledState.ts`)

`pollState()` captures ambient state on demand (only when context assembly is triggered):

- **Active editor**: cursor position, selection, visible range, dirty state, line count
- **Open tabs**: via `window.tabGroups`, filtered to `TabInputText`
- **Diagnostics**: errors and warnings only, capped at configurable max (default 50)
- **Breakpoints**: `SourceBreakpoint` instances with location and condition
- **Git status**: via `vscode.git` extension API (branch, ahead/behind, staged/modified/untracked)

All polls run concurrently via `Promise.all()`.

### Phase Detection (`phaseDetection.ts`)

Pure function `detectPhase(events)` uses a score-based system:

| Pattern | Inferred Phase |
| --- | --- |
| Many file switches, few edits | `exploring` |
| Edits + saves + test/build commands | `iterating` |
| Many edits, few file switches | `building` |
| Active debug session + breakpoints | `debugging` |
| Git blame/log/diff commands | `archaeology` |

Returns phase, confidence (0.0-1.0), human-readable reasoning, and list of recent files.

### Context Bundle Format

```typescript
interface ContextBundle {
  version: 1;
  timestamp: string;           // ISO 8601
  eventLog: ActivityEvent[];   // Recent events (configurable window)
  state: PolledState;          // Current ambient state
  phase: PhaseAssessment;      // Inferred workflow phase
  selection?: { ... };         // Current code selection if any
}
```

The `formatBundleForLLM()` function converts this to compact markdown (~700 tokens typical).

### Line Number Handling

VS Code uses 0-indexed lines internally. All public-facing numbers are 1-indexed:
```typescript
const startLine = sel.start.line + 1;
const endLine = sel.end.line + 1;
```

### Selection Handling

Both `sendCodeRef` and `sendToClaudeCode` distinguish between:
- **Empty selection** (cursor only): `sel.isEmpty` is true
  - `sendCodeRef`: Sets `snippet` to empty string
  - `sendToClaudeCode`: Gets current line text via `doc.lineAt(sel.start.line).text`
- **Text selection**: Gets text via `doc.getText(new vscode.Range(sel.start, sel.end))`

### Activation

The extension activates on `onStartupFinished` (not on-command) so the event log begins capturing immediately. Activation cost is minimal — just registering listeners and allocating the ring buffer.

## Configuration

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `ctxbridge.endpoint` | string | `""` | HTTPS endpoint for payload delivery |
| `ctxbridge.eventBufferSize` | number | `200` | Max events in ring buffer |
| `ctxbridge.eventWindowSeconds` | number | `60` | Seconds of history in context bundles |
| `ctxbridge.maxDiagnosticsInContext` | number | `50` | Max diagnostic entries in context |

## TypeScript Configuration

- Target: ES2018 (required for `AsyncIterable` support)
- TypeScript: 5.9+
- VS Code engine: 1.93.0+ (required for terminal shell integration API)
- Strict mode: enabled

## File Structure

- `src/extension.ts` - Entry point (~135 lines)
- `src/types.ts` - Shared type definitions (~170 lines)
- `src/ringBuffer.ts` - Generic circular buffer (~45 lines)
- `src/eventLog.ts` - Event-driven capture (~155 lines)
- `src/polledState.ts` - Polled state capture (~125 lines)
- `src/phaseDetection.ts` - Phase detection (~125 lines)
- `src/contextAssembly.ts` - Context assembly + LLM formatter (~150 lines)
- `src/httpClient.ts` - HTTP POST helper (~35 lines)
- `out/` - Compiled JavaScript output
- `package.json` - Extension manifest
- `tsconfig.json` - TypeScript config
- `.vscode/launch.json` - Debug config (F5)
- `.vscode/tasks.json` - Build tasks
