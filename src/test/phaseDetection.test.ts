import * as assert from 'assert';
import { detectPhase } from '../phaseDetection';
import { ActivityEvent } from '../types';

const t = Date.now();

suite('phaseDetection', () => {

  test('returns unknown with fewer than 3 events', () => {
    const result = detectPhase([]);
    assert.strictEqual(result.phase, 'unknown');
    assert.strictEqual(result.confidence, 0);

    const oneEvent = detectPhase([
      { kind: 'file_switch', fromUri: null, toUri: 'a.ts', toLanguageId: 'typescript', timestamp: t },
    ]);
    assert.strictEqual(oneEvent.phase, 'unknown');
  });

  test('detects exploring: many file switches, no edits', () => {
    const events: ActivityEvent[] = [
      { kind: 'file_switch', fromUri: null, toUri: 'a.ts', toLanguageId: 'ts', timestamp: t },
      { kind: 'file_switch', fromUri: 'a.ts', toUri: 'b.ts', toLanguageId: 'ts', timestamp: t },
      { kind: 'file_switch', fromUri: 'b.ts', toUri: 'c.ts', toLanguageId: 'ts', timestamp: t },
      { kind: 'file_switch', fromUri: 'c.ts', toUri: 'd.ts', toLanguageId: 'ts', timestamp: t },
      { kind: 'file_switch', fromUri: 'd.ts', toUri: 'e.ts', toLanguageId: 'ts', timestamp: t },
    ];
    const result = detectPhase(events);
    assert.strictEqual(result.phase, 'exploring');
    assert.ok(result.confidence > 0);
    assert.ok(result.reasoning.includes('switches'));
  });

  test('detects iterating: edits + saves + test commands', () => {
    const events: ActivityEvent[] = [
      { kind: 'text_change', uri: 'a.ts', changeCount: 5, timestamp: t },
      { kind: 'text_change', uri: 'a.ts', changeCount: 3, timestamp: t },
      { kind: 'file_save', uri: 'a.ts', languageId: 'typescript', timestamp: t },
      { kind: 'terminal_command_start', commandLine: 'npm test', terminalName: 'bash', timestamp: t },
    ];
    const result = detectPhase(events);
    assert.strictEqual(result.phase, 'iterating');
    assert.ok(result.confidence > 0);
  });

  test('detects building: many edits, few file switches', () => {
    const events: ActivityEvent[] = [
      { kind: 'text_change', uri: 'a.ts', changeCount: 5, timestamp: t },
      { kind: 'text_change', uri: 'a.ts', changeCount: 3, timestamp: t },
      { kind: 'text_change', uri: 'a.ts', changeCount: 2, timestamp: t },
      { kind: 'file_save', uri: 'a.ts', languageId: 'typescript', timestamp: t },
      { kind: 'file_save', uri: 'a.ts', languageId: 'typescript', timestamp: t },
    ];
    const result = detectPhase(events);
    assert.strictEqual(result.phase, 'building');
    assert.ok(result.confidence > 0);
  });

  test('detects debugging: debug session + breakpoints', () => {
    const events: ActivityEvent[] = [
      { kind: 'debug_start', sessionName: 'Launch', sessionType: 'node', timestamp: t },
      { kind: 'breakpoint_change', added: 2, removed: 0, changed: 0, timestamp: t },
      { kind: 'file_switch', fromUri: 'a.ts', toUri: 'b.ts', toLanguageId: 'ts', timestamp: t },
    ];
    const result = detectPhase(events);
    assert.strictEqual(result.phase, 'debugging');
    assert.ok(result.confidence > 0);
  });

  test('detects archaeology: git history commands', () => {
    const events: ActivityEvent[] = [
      { kind: 'terminal_command_start', commandLine: 'git log --oneline', terminalName: 'bash', timestamp: t },
      { kind: 'file_switch', fromUri: 'a.ts', toUri: 'b.ts', toLanguageId: 'ts', timestamp: t },
      { kind: 'file_switch', fromUri: 'b.ts', toUri: 'c.ts', toLanguageId: 'ts', timestamp: t },
      { kind: 'file_switch', fromUri: 'c.ts', toUri: 'd.ts', toLanguageId: 'ts', timestamp: t },
    ];
    const result = detectPhase(events);
    assert.strictEqual(result.phase, 'archaeology');
    assert.ok(result.confidence > 0);
    assert.ok(result.reasoning.includes('git history'));
  });

  test('git blame triggers archaeology', () => {
    const events: ActivityEvent[] = [
      { kind: 'terminal_command_start', commandLine: 'git blame src/main.ts', terminalName: 'bash', timestamp: t },
      { kind: 'file_switch', fromUri: 'a.ts', toUri: 'b.ts', toLanguageId: 'ts', timestamp: t },
      { kind: 'file_switch', fromUri: 'b.ts', toUri: 'c.ts', toLanguageId: 'ts', timestamp: t },
    ];
    const result = detectPhase(events);
    assert.strictEqual(result.phase, 'archaeology');
  });

  test('git diff triggers archaeology', () => {
    const events: ActivityEvent[] = [
      { kind: 'terminal_command_start', commandLine: 'git diff HEAD~3', terminalName: 'bash', timestamp: t },
      { kind: 'file_switch', fromUri: 'a.ts', toUri: 'b.ts', toLanguageId: 'ts', timestamp: t },
      { kind: 'file_switch', fromUri: 'b.ts', toUri: 'c.ts', toLanguageId: 'ts', timestamp: t },
    ];
    const result = detectPhase(events);
    assert.strictEqual(result.phase, 'archaeology');
  });

  test('confidence is capped at 1.0', () => {
    const events: ActivityEvent[] = [
      { kind: 'debug_start', sessionName: 'Launch', sessionType: 'node', timestamp: t },
      { kind: 'breakpoint_change', added: 5, removed: 0, changed: 0, timestamp: t },
      { kind: 'breakpoint_change', added: 2, removed: 1, changed: 0, timestamp: t },
    ];
    const result = detectPhase(events);
    assert.ok(result.confidence <= 1.0);
    assert.ok(result.confidence >= 0);
  });

  test('recentFiles is populated and capped at 5', () => {
    const events: ActivityEvent[] = [];
    for (let i = 0; i < 10; i++) {
      events.push({
        kind: 'file_switch',
        fromUri: `file${i}.ts`,
        toUri: `file${i + 1}.ts`,
        toLanguageId: 'ts',
        timestamp: t,
      });
    }
    const result = detectPhase(events);
    assert.ok(result.recentFiles.length <= 5);
    assert.ok(result.recentFiles.length > 0);
  });

  test('jest command triggers iterating', () => {
    const events: ActivityEvent[] = [
      { kind: 'text_change', uri: 'a.ts', changeCount: 1, timestamp: t },
      { kind: 'file_save', uri: 'a.ts', languageId: 'ts', timestamp: t },
      { kind: 'terminal_command_start', commandLine: 'jest --watch', terminalName: 'bash', timestamp: t },
    ];
    const result = detectPhase(events);
    assert.strictEqual(result.phase, 'iterating');
  });

  test('pytest command triggers iterating', () => {
    const events: ActivityEvent[] = [
      { kind: 'text_change', uri: 'a.py', changeCount: 1, timestamp: t },
      { kind: 'file_save', uri: 'a.py', languageId: 'python', timestamp: t },
      { kind: 'terminal_command_start', commandLine: 'pytest tests/', terminalName: 'bash', timestamp: t },
    ];
    const result = detectPhase(events);
    assert.strictEqual(result.phase, 'iterating');
  });

  test('diagnostic changes add to iterating score', () => {
    const events: ActivityEvent[] = [
      { kind: 'text_change', uri: 'a.ts', changeCount: 1, timestamp: t },
      { kind: 'text_change', uri: 'a.ts', changeCount: 2, timestamp: t },
      { kind: 'file_save', uri: 'a.ts', languageId: 'ts', timestamp: t },
      { kind: 'diagnostic_change', uris: ['a.ts'], totalErrors: 2, totalWarnings: 1, timestamp: t },
      { kind: 'diagnostic_change', uris: ['a.ts'], totalErrors: 0, totalWarnings: 1, timestamp: t },
    ];
    const result = detectPhase(events);
    assert.ok(result.phase === 'iterating' || result.phase === 'building');
  });

  test('debug stop without start does not trigger debugging', () => {
    const events: ActivityEvent[] = [
      { kind: 'debug_stop', sessionName: 'Launch', sessionType: 'node', timestamp: t },
      { kind: 'file_switch', fromUri: 'a.ts', toUri: 'b.ts', toLanguageId: 'ts', timestamp: t },
      { kind: 'text_change', uri: 'b.ts', changeCount: 1, timestamp: t },
    ];
    const result = detectPhase(events);
    assert.notStrictEqual(result.phase, 'debugging');
  });
});
