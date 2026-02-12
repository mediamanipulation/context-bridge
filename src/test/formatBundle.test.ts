import * as assert from 'assert';
import { ContextBundle } from '../types';

// formatBundleForLLM uses no VS Code APIs — it's a pure function.
// We import it dynamically to avoid the vscode module dependency at the top
// of contextAssembly.ts. Instead we test via require after compilation.

// NOTE: Since contextAssembly.ts imports vscode at the top level, we need
// to provide a minimal mock. This test file works when run inside the
// VS Code test runner (integration test suite).
// For a pure unit test approach, formatBundleForLLM could be extracted
// to its own file. For now, we test it as an integration test.

suite('formatBundleForLLM', function () {
  // This test will only run inside the VS Code integration test runner
  // because contextAssembly.ts imports 'vscode' at the top level.
  // We guard it so the unit test runner doesn't crash.

  let formatBundleForLLM: (bundle: ContextBundle) => string;

  suiteSetup(() => {
    try {
      const mod = require('../contextAssembly');
      formatBundleForLLM = mod.formatBundleForLLM;
    } catch {
      // Not available in unit test runner — skip
    }
  });

  function skipIfNoVscode() {
    if (!formatBundleForLLM) {
      // eslint-disable-next-line no-console
      console.log('    (skipped — requires VS Code runtime)');
      return true;
    }
    return false;
  }

  const minimalBundle: ContextBundle = {
    version: 1,
    timestamp: '2026-02-12T12:00:00.000Z',
    eventLog: [],
    state: {
      activeEditor: null,
      openTabs: [],
      dirtyFiles: [],
      diagnostics: [],
      breakpoints: [],
      gitStatus: null,
      workspaceFolders: [],
    },
    phase: {
      phase: 'unknown',
      confidence: 0,
      reasoning: 'Insufficient activity',
      recentFiles: [],
    },
  };

  test('includes phase and timestamp', function () {
    if (skipIfNoVscode()) { this.skip(); return; }
    const output = formatBundleForLLM(minimalBundle);
    assert.ok(output.includes('2026-02-12T12:00:00.000Z'));
    assert.ok(output.includes('unknown'));
    assert.ok(output.includes('0% confidence'));
  });

  test('includes active editor when present', function () {
    if (skipIfNoVscode()) { this.skip(); return; }
    const bundle: ContextBundle = {
      ...minimalBundle,
      state: {
        ...minimalBundle.state,
        activeEditor: {
          uri: 'file:///src/main.ts',
          languageId: 'typescript',
          cursorLine: 42,
          cursorColumn: 10,
          selectionText: '',
          selectionStartLine: 42,
          selectionEndLine: 42,
          visibleRangeStart: 1,
          visibleRangeEnd: 60,
          lineCount: 200,
          isDirty: true,
        },
      },
    };
    const output = formatBundleForLLM(bundle);
    assert.ok(output.includes('main.ts'));
    assert.ok(output.includes('line 42'));
    assert.ok(output.includes('unsaved'));
  });

  test('includes diagnostics summary', function () {
    if (skipIfNoVscode()) { this.skip(); return; }
    const bundle: ContextBundle = {
      ...minimalBundle,
      state: {
        ...minimalBundle.state,
        diagnostics: [
          { uri: 'file:///a.ts', severity: 'error', message: 'Type error', line: 10, source: 'ts' },
          { uri: 'file:///b.ts', severity: 'warning', message: 'Unused var', line: 5, source: 'ts' },
        ],
      },
    };
    const output = formatBundleForLLM(bundle);
    assert.ok(output.includes('1 errors'));
    assert.ok(output.includes('1 warnings'));
    assert.ok(output.includes('Type error'));
    assert.ok(output.includes('Unused var'));
  });

  test('caps errors at 10 in formatted output', function () {
    if (skipIfNoVscode()) { this.skip(); return; }
    const diagnostics = [];
    for (let i = 0; i < 15; i++) {
      diagnostics.push({ uri: `file:///f${i}.ts`, severity: 'error' as const, message: `Error ${i}`, line: i, source: 'ts' });
    }
    const bundle: ContextBundle = {
      ...minimalBundle,
      state: { ...minimalBundle.state, diagnostics },
    };
    const output = formatBundleForLLM(bundle);
    const errorLines = output.split('\n').filter(l => l.includes('ERROR'));
    assert.ok(errorLines.length <= 10, `Expected at most 10 error lines, got ${errorLines.length}`);
  });

  test('caps tabs at 15 in formatted output', function () {
    if (skipIfNoVscode()) { this.skip(); return; }
    const openTabs = [];
    for (let i = 0; i < 20; i++) {
      openTabs.push({ uri: `file:///tab${i}.ts`, label: `tab${i}.ts`, isDirty: false, isActive: false, isPinned: false });
    }
    const bundle: ContextBundle = {
      ...minimalBundle,
      state: { ...minimalBundle.state, openTabs },
    };
    const output = formatBundleForLLM(bundle);
    assert.ok(output.includes('(20)'));
    const tabLines = output.split('\n').filter(l => l.includes('tab') && l.startsWith('  - '));
    assert.ok(tabLines.length <= 15, `Expected at most 15 tab lines, got ${tabLines.length}`);
  });

  test('includes git status when present', function () {
    if (skipIfNoVscode()) { this.skip(); return; }
    const bundle: ContextBundle = {
      ...minimalBundle,
      state: {
        ...minimalBundle.state,
        gitStatus: {
          branch: 'feature/test',
          ahead: 3,
          behind: 0,
          staged: ['src/a.ts'],
          modified: ['src/b.ts', 'src/c.ts'],
          untracked: [],
        },
      },
    };
    const output = formatBundleForLLM(bundle);
    assert.ok(output.includes('feature/test'));
    assert.ok(output.includes('ahead 3'));
    assert.ok(output.includes('Modified'));
    assert.ok(output.includes('Staged'));
  });

  test('includes selection with code block', function () {
    if (skipIfNoVscode()) { this.skip(); return; }
    const bundle: ContextBundle = {
      ...minimalBundle,
      selection: {
        uri: 'file:///src/main.ts',
        startLine: 10,
        endLine: 15,
        snippet: 'function hello() {\n  return "world";\n}',
        languageId: 'typescript',
      },
    };
    const output = formatBundleForLLM(bundle);
    assert.ok(output.includes('Selection'));
    assert.ok(output.includes('```typescript'));
    assert.ok(output.includes('function hello'));
  });

  test('includes event narrative with relative timestamps', function () {
    if (skipIfNoVscode()) { this.skip(); return; }
    const now = Date.now();
    const bundle: ContextBundle = {
      ...minimalBundle,
      eventLog: [
        { kind: 'file_switch', timestamp: now - 10000, fromUri: null, toUri: 'file:///a.ts', toLanguageId: 'ts' },
        { kind: 'file_save', timestamp: now - 5000, uri: 'file:///a.ts', languageId: 'typescript' },
      ],
    };
    const output = formatBundleForLLM(bundle);
    assert.ok(output.includes('Recent activity'));
    assert.ok(output.includes('switched to'));
    assert.ok(output.includes('saved'));
    assert.ok(output.includes('s ago'));
  });
});
