import * as vscode from 'vscode';
import { EventLog } from './eventLog';
import { assembleContext, formatBundleForLLM } from './contextAssembly';
import { postJson } from './httpClient';

export function activate(context: vscode.ExtensionContext) {
  const out = vscode.window.createOutputChannel('Context Bridge');
  context.subscriptions.push(out);

  // Start event logging immediately
  const eventLog = new EventLog();
  eventLog.start();
  context.subscriptions.push({ dispose: () => eventLog.dispose() });

  // --- Code reference as structured JSON ---
  const sendCmd = vscode.commands.registerCommand('ctxbridge.sendCodeRef', async () => {
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
        languageId: doc.languageId,
        selectionKind: sel.isEmpty ? 'cursor' : 'selection',
        timestamp: new Date().toISOString()
      }
    };

    out.appendLine(JSON.stringify(payload, null, 2));

    const config = vscode.workspace.getConfiguration();
    const endpoint = config.get<string>('ctxbridge.endpoint');
    if (endpoint) {
      try {
        await postJson(endpoint, payload);
        vscode.window.showInformationMessage('Code reference sent to endpoint');
      } catch (e: any) {
        vscode.window.showErrorMessage('Failed to send to endpoint: ' + String(e.message || e));
      }
    } else {
      vscode.window.showInformationMessage('Code reference written to Output channel "Context Bridge"');
    }
  });
  context.subscriptions.push(sendCmd);

  // --- Code reference formatted for Claude Code ---
  const claudeCodeCmd = vscode.commands.registerCommand('ctxbridge.sendToClaudeCode', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { vscode.window.showErrorMessage('No active editor'); return; }

    const doc = editor.document;
    const sel = editor.selection;
    const startLine = sel.start.line + 1;
    const endLine = sel.end.line + 1;
    const fileName = vscode.workspace.asRelativePath(doc.uri.fsPath);
    const langId = doc.languageId;
    const snippet = sel.isEmpty ? doc.lineAt(sel.start.line).text : doc.getText(new vscode.Range(sel.start, sel.end));

    let formattedRef = '';
    if (sel.isEmpty) {
      formattedRef = `Reference: [${fileName}:${startLine}](${fileName}#L${startLine})\n\`\`\`${langId}\n${snippet}\n\`\`\``;
    } else if (startLine === endLine) {
      formattedRef = `Reference: [${fileName}:${startLine}](${fileName}#L${startLine})\n\`\`\`${langId}\n${snippet}\n\`\`\``;
    } else {
      formattedRef = `Reference: [${fileName}:${startLine}-${endLine}](${fileName}#L${startLine}-L${endLine})\n\`\`\`${langId}\n${snippet}\n\`\`\``;
    }

    await vscode.env.clipboard.writeText(formattedRef);

    out.appendLine('Code reference copied to clipboard for Claude Code:');
    out.appendLine(formattedRef);

    vscode.window.showInformationMessage('Code reference copied! Paste it in your Claude Code chat.');
  });
  context.subscriptions.push(claudeCodeCmd);

  // --- Assemble developer context ---
  const assembleCmd = vscode.commands.registerCommand('ctxbridge.assembleContext', async () => {
    try {
      const bundle = await assembleContext(eventLog);
      const formatted = formatBundleForLLM(bundle);

      await vscode.env.clipboard.writeText(formatted);
      out.appendLine('--- Context Bundle ---');
      out.appendLine(formatted);
      out.appendLine('--- End Bundle ---');

      const config = vscode.workspace.getConfiguration();
      const endpoint = config.get<string>('ctxbridge.endpoint');
      if (endpoint) {
        try {
          await postJson(endpoint, bundle);
          vscode.window.showInformationMessage('Context bundle sent to endpoint and copied to clipboard');
        } catch (e: any) {
          vscode.window.showErrorMessage('Endpoint send failed: ' + String(e.message || e));
        }
      } else {
        vscode.window.showInformationMessage('Context bundle copied to clipboard');
      }
    } catch (e: any) {
      vscode.window.showErrorMessage('Context assembly failed: ' + String(e.message || e));
      out.appendLine('ERROR: ' + String(e.message || e));
    }
  });
  context.subscriptions.push(assembleCmd);

  // --- Show context as JSON (debugging) ---
  const showJsonCmd = vscode.commands.registerCommand('ctxbridge.showContextJson', async () => {
    try {
      const bundle = await assembleContext(eventLog);
      const json = JSON.stringify(bundle, null, 2);
      const doc = await vscode.workspace.openTextDocument({
        content: json,
        language: 'json',
      });
      await vscode.window.showTextDocument(doc, { preview: true });
    } catch (e: any) {
      vscode.window.showErrorMessage('Context assembly failed: ' + String(e.message || e));
    }
  });
  context.subscriptions.push(showJsonCmd);
}

export function deactivate() {}
