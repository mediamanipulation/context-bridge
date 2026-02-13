# MCP Code Reference Extension - Complete Project Export

**Export Date**: 2026-02-12
**Project**: MCP Code Reference VS Code Extension
**Technology Stack**: TypeScript, VS Code API, Node.js

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Project Structure](#project-structure)
3. [Key Features](#key-features)
4. [Source Code](#source-code)
5. [Configuration Files](#configuration-files)
6. [Build & Development](#build--development)
7. [Architecture & Design](#architecture--design)
8. [Installation & Usage](#installation--usage)

---

## Project Overview

**MCP Code Reference** is a VS Code extension that captures code selections and formats them as references. It provides two primary workflows:

1. **MCP-style payloads** - Structured JSON format for external MCP endpoints
2. **Claude Code integration** - Markdown-formatted references with clickable links for AI chat

This extension enables seamless code referencing when working with Claude Code and other AI chat systems.

### Core Features

- ðŸ“‹ **Send to Claude Code**: Format and copy code references directly for Claude Code chat
- ðŸ”— **MCP-style payloads**: Send code references to external MCP endpoints
- âš¡ **Quick keybinding**: Use `Ctrl+Shift+C` (or `Cmd+Shift+C` on Mac)
- ðŸŽ¯ **Line-precise references**: Includes exact line numbers and clickable links

---

## Project Structure

```
mcp-code-ref/
â”œâ”€â”€ src/
â”‚   â””â”€â”€ extension.ts           # Main extension source code (117 lines)
â”œâ”€â”€ out/
â”‚   â””â”€â”€ extension.js           # Compiled JavaScript output
â”œâ”€â”€ .vscode/
â”‚   â”œâ”€â”€ launch.json           # Debug configuration
â”‚   â””â”€â”€ tasks.json            # Build tasks
â”œâ”€â”€ package.json              # Extension manifest
â”œâ”€â”€ tsconfig.json             # TypeScript configuration
â”œâ”€â”€ README.md                 # User-facing documentation
â”œâ”€â”€ CLAUDE.md                 # Claude Code development guide
â”œâ”€â”€ CLAUDE_PROJECT_EXPORT.md  # This file
â””â”€â”€ node_modules/             # Dependencies

Key Output:
â”œâ”€â”€ mcp-code-ref-0.0.2.vsix   # Packaged extension file
â””â”€â”€ package-lock.json          # Dependency lock file
```

---

## Key Features

### 1. Claude Code Integration Command
- **Command ID**: `mcp.sendToClaudeCode`
- **Keybinding**: `Ctrl+Shift+C` (Windows/Linux) or `Cmd+Shift+C` (Mac)
- **Behavior**: Formats code reference as markdown with clickable link, copies to clipboard
- **Format**: `Reference: [filename:lineNum](filename#LlineNum)`

### 2. MCP Reference Command
- **Command ID**: `mcp.sendCodeRef`
- **Behavior**: Creates JSON payload with metadata, logs to output, optionally POSTs to endpoint
- **Output**: Structured JSON with file URI, line numbers, code snippet, timestamp

### 3. Configuration
- **Setting**: `mcp.endpoint` (optional HTTPS endpoint)
- **Output Channel**: "MCP CodeRef" - visible in VS Code Output panel

---

## Source Code

### src/extension.ts

```typescript
import * as vscode from 'vscode';
import * as https from 'https';
import { URL } from 'url';

export function activate(context: vscode.ExtensionContext) {
  const out = vscode.window.createOutputChannel('MCP CodeRef');
  context.subscriptions.push(out);

  const sendCmd = vscode.commands.registerCommand('mcp.sendCodeRef', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { vscode.window.showErrorMessage('No active editor'); return; }
    const doc = editor.document;
    const sel = editor.selection;
    const startLine = sel.start.line + 1;
    const endLine = sel.end.line + 1;
    const fileUri = doc.uri.toString();
    const snippet = sel.isEmpty ? '' : doc.getText(new vscode.Range(sel.start, sel.end));

    const payload = {
      type: 'code.reference',
      sender: 'vscode',
      payload: {
        fileUri,
        startLine,
        endLine,
        snippet,
        selectionKind: sel.isEmpty ? 'cursor' : 'selection',
        timestamp: new Date().toISOString()
      }
    };

    out.appendLine(JSON.stringify(payload, null, 2));

    const config = vscode.workspace.getConfiguration();
    const endpoint = config.get<string>('mcp.endpoint');
    if (endpoint) {
      try {
        await postJson(endpoint, payload);
        vscode.window.showInformationMessage('Code reference sent to MCP endpoint');
      } catch (e:any) {
        vscode.window.showErrorMessage('Failed to send to endpoint: ' + String(e.message || e));
      }
    } else {
      vscode.window.showInformationMessage('Code reference written to Output channel "MCP CodeRef"');
    }
  });

  context.subscriptions.push(sendCmd);

  // New command for Claude Code integration
  const claudeCodeCmd = vscode.commands.registerCommand('mcp.sendToClaudeCode', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { vscode.window.showErrorMessage('No active editor'); return; }

    const doc = editor.document;
    const sel = editor.selection;
    const startLine = sel.start.line + 1;
    const endLine = sel.end.line + 1;
    const fileName = vscode.workspace.asRelativePath(doc.uri.fsPath);
    const snippet = sel.isEmpty ? doc.lineAt(sel.start.line).text : doc.getText(new vscode.Range(sel.start, sel.end));

    // Format the reference for Claude Code
    let formattedRef = '';
    if (sel.isEmpty) {
      formattedRef = `Reference: [${fileName}:${startLine}](${fileName}#L${startLine})\n\`\`\`\n${snippet}\n\`\`\``;
    } else if (startLine === endLine) {
      formattedRef = `Reference: [${fileName}:${startLine}](${fileName}#L${startLine})\n\`\`\`\n${snippet}\n\`\`\``;
    } else {
      formattedRef = `Reference: [${fileName}:${startLine}-${endLine}](${fileName}#L${startLine}-L${endLine})\n\`\`\`\n${snippet}\n\`\`\``;
    }

    // Copy to clipboard
    await vscode.env.clipboard.writeText(formattedRef);

    out.appendLine('Code reference copied to clipboard for Claude Code:');
    out.appendLine(formattedRef);

    vscode.window.showInformationMessage('Code reference copied! Paste it in your Claude Code chat.');
  });

  context.subscriptions.push(claudeCodeCmd);
}

export function deactivate() {}

function postJson(endpoint: string, data: any): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(endpoint);
      const payload = JSON.stringify(data);
      const opts: any = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + (url.search || ''),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const req = https.request(opts, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve();
          else reject(new Error('Status ' + res.statusCode + ' body: ' + body));
        });
      });

      req.on('error', (err) => reject(err));
      req.write(payload);
      req.end();
    } catch (err) { reject(err); }
  });
}
```

**File**: `src/extension.ts` (117 lines)

**Key Functions**:
- `activate()` - Extension entry point, registers both commands
- `sendCodeRef()` - Command that creates MCP payload and sends to endpoint
- `sendToClaudeCode()` - Command that formats markdown reference and copies to clipboard
- `postJson()` - HTTPS helper for sending payloads to configured endpoint

---

## Configuration Files

### package.json

```json
{
  "name": "mcp-code-ref",
  "displayName": "MCP Code Reference",
  "publisher": "your-publisher",
  "version": "0.0.2",
  "repository": {
    "type": "git",
    "url": "https://github.com/local/mcp-code-ref"
  },
  "engines": {
    "vscode": "^1.60.0"
  },
  "activationEvents": [
    "onCommand:mcp.sendCodeRef",
    "onCommand:mcp.sendToClaudeCode"
  ],
  "main": "./out/extension.js",
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -w -p ./"
  },
  "devDependencies": {
    "@types/node": "^25.2.3",
    "@types/vscode": "^1.60.0",
    "typescript": "^5.9.3"
  },
  "contributes": {
    "commands": [
      {
        "command": "mcp.sendCodeRef",
        "title": "MCP: Send Code Reference"
      },
      {
        "command": "mcp.sendToClaudeCode",
        "title": "Send to Claude Code"
      }
    ],
    "menus": {
      "editor/context": [
        {
          "command": "mcp.sendCodeRef",
          "when": "editorHasSelection || editorTextFocus",
          "group": "navigation"
        },
        {
          "command": "mcp.sendToClaudeCode",
          "when": "editorHasSelection || editorTextFocus",
          "group": "navigation"
        }
      ]
    },
    "keybindings": [
      {
        "command": "mcp.sendToClaudeCode",
        "key": "ctrl+shift+c",
        "mac": "cmd+shift+c",
        "when": "editorTextFocus"
      }
    ],
    "configuration": {
      "type": "object",
      "title": "MCP",
      "properties": {
        "mcp.endpoint": {
          "type": "string",
          "description": "Optional MCP HTTP endpoint to POST code.reference payloads to (e.g. https://host/api/mcp)",
          "default": ""
        }
      }
    }
  }
}
```

**File**: `package.json`

**Key Sections**:
- **activationEvents**: Extension activates on specific commands
- **contributes.commands**: Registers two commands with titles
- **contributes.menus**: Adds context menu items in editor
- **contributes.keybindings**: Maps `Ctrl+Shift+C` to Claude Code command
- **contributes.configuration**: Provides `mcp.endpoint` setting

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "es2018",
    "module": "commonjs",
    "lib": ["es2018"],
    "outDir": "./out",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", ".vscode-test"]
}
```

**File**: `tsconfig.json`

**Configuration Notes**:
- **target**: ES2018 (required for AsyncIterable support)
- **strict mode**: Enabled for type safety
- **sourceMap**: true for debugging
- **outDir**: Compiles to `./out/extension.js`

---

## Build & Development

### Commands

```bash
# Install dependencies
npm install

# Compile TypeScript to JavaScript
npm run compile

# Watch mode (auto-compile on file changes)
npm run watch

# Prepare for publication
npm run vscode:prepublish
```

### Testing the Extension

1. **Debug Mode (F5)**:
   - Press `F5` in VS Code
   - Opens Extension Development Host
   - Set breakpoints, use VS Code debugger
   - Configuration from `.vscode/launch.json`

2. **Package for Installation**:
   - Run: `vsce package --no-dependencies`
   - Creates: `mcp-code-ref-0.0.2.vsix`
   - Install in VS Code: `Ctrl+Shift+P` â†’ "Extensions: Install from VSIX"

3. **Manual Testing**:
   - Select code in editor
   - Press `Ctrl+Shift+C` or right-click â†’ "Send to Claude Code"
   - Formatted reference appears in clipboard
   - Paste into Claude Code chat

### Build Outputs

- **JavaScript**: `out/extension.js` (compiled from `src/extension.ts`)
- **Package**: `mcp-code-ref-0.0.2.vsix` (for distribution)
- **Source Maps**: Generated for debugging
- **Lock File**: `package-lock.json` (dependency versions)

---

## Architecture & Design

### Selection Handling

**2 Modes**:

1. **Cursor-only** (no text selected)
   - Gets current line text
   - Sets `selectionKind: 'cursor'`
   - In Claude output: includes full line

2. **Text selection** (text highlighted)
   - Gets selected text range
   - Sets `selectionKind: 'selection'`
   - Includes exact line range (startLine-endLine)

### Line Numbers

**Critical detail**: VS Code uses 0-indexed line numbers internally, but the extension outputs **1-indexed** line numbers for human readability:

```typescript
const startLine = sel.start.line + 1;  // Convert 0-indexed to 1-indexed
const endLine = sel.end.line + 1;
```

This matches what you see in the editor line number gutter.

### Output Formats

#### Claude Code Format
```
Reference: [src/extension.ts:50-60](src/extension.ts#L50-L60)
```
typescript
// code here
```
```

#### MCP Payload Format
```json
{
  "type": "code.reference",
  "sender": "vscode",
  "payload": {
    "fileUri": "file:///path/to/src/extension.ts",
    "startLine": 50,
    "endLine": 60,
    "snippet": "// code here",
    "selectionKind": "selection",
    "timestamp": "2026-02-11T12:34:56.000Z"
  }
}
```

### Shared Output Channel

Both commands write to a single output channel: `'MCP CodeRef'`

- Accessible via VS Code Output panel
- Shows all code reference operations
- Useful for debugging

---

## Installation & Usage

### For Users

1. **Option A - From VSIX File**:
   ```
   In VS Code: Ctrl+Shift+P â†’ "Extensions: Install from VSIX"
   Select: mcp-code-ref-0.0.2.vsix
   ```

2. **Option B - From Source**:
   ```bash
   git clone <repo>
   cd mcp-code-ref
   npm install
   npm run compile
   # Then install from VSIX (see Option A)
   ```

### Usage

**Quick Reference**:
1. Select code or position cursor
2. Press `Ctrl+Shift+C` or right-click â†’ "Send to Claude Code"
3. Paste formatted reference into Claude Code chat

**Configuration** (optional):
- Settings â†’ "MCP" section
- Set `mcp.endpoint` if you have an MCP server endpoint
- Leave blank for clipboard-only mode

### Example Workflow

1. **In VS Code**:
   - Open `src/extension.ts`
   - Select lines 50-60
   - Press `Ctrl+Shift+C`

2. **In Browser Claude**:
   - Switch to claude.ai
   - Paste the reference
   - I can now see the exact code with line numbers

---

## Development Notes for Claude

### Next Steps / Enhancement Ideas

1. **Conversation Export** - Add command to export full VS Code conversation history for Claude Projects
2. **Syntax Highlighting** - Include language hints in code blocks for better highlighting in Claude
3. **Multi-file References** - Bundle related files into single reference
4. **Template Support** - Include comments explaining code intent
5. **MCP Server Integration** - Full bidirectional sync with MCP endpoints

### Testing Checklist

- [ ] Cursor-only selection (no text)
- [ ] Single-line selection
- [ ] Multi-line selection
- [ ] With `mcp.endpoint` configured
- [ ] Without endpoint (clipboard only)
- [ ] Debug mode (F5)
- [ ] Packaged VSIX installation
- [ ] Keybinding works (`Ctrl+Shift+C`)
- [ ] Context menu appears

### Debugging Tips

- Check "MCP CodeRef" output channel for logs
- In debug mode, set breakpoints on line 10 or 51
- Watch clipboard contents with `xclip -selection clipboard -o` (Linux)
- Verify JSON payload format matches MCP spec

---

**Generated**: 2026-02-12
**Version**: mcp-code-ref 0.0.2
**Ready for**: Claude Projects upload
