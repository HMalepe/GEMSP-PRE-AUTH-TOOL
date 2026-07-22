import assert from 'node:assert/strict';
import { test } from 'node:test';
import { logger } from '../../src/logging/logger.js';

function captureConsole(fn: () => void): { stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  console.log = (line: string) => stdout.push(line);
  console.warn = (line: string) => stderr.push(line);
  console.error = (line: string) => stderr.push(line);
  try {
    fn();
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
  }
  return { stdout, stderr };
}

test('info logs a single structured JSON line with event and fields', () => {
  const { stdout } = captureConsole(() => logger.info('test_event', { foo: 'bar' }));
  assert.equal(stdout.length, 1);
  const parsed = JSON.parse(stdout[0]!);
  assert.equal(parsed.level, 'info');
  assert.equal(parsed.event, 'test_event');
  assert.equal(parsed.foo, 'bar');
  assert.equal(typeof parsed.timestamp, 'string');
});

test('error logs go to stderr, not stdout', () => {
  const { stdout, stderr } = captureConsole(() => logger.error('boom', { reason: 'x' }));
  assert.equal(stdout.length, 0);
  assert.equal(stderr.length, 1);
  assert.equal(JSON.parse(stderr[0]!).level, 'error');
});

test('LOG_LEVEL filters out lower-severity events', () => {
  const env = { LOG_LEVEL: 'warn' } as NodeJS.ProcessEnv;
  const { stdout, stderr } = captureConsole(() => {
    logger.debug('should be filtered', {}, env);
    logger.info('also filtered', {}, env);
    logger.warn('should appear', {}, env);
  });
  assert.equal(stdout.length, 0, 'debug/info below warn threshold must not log');
  assert.equal(stderr.length, 1);
});

test('an invalid LOG_LEVEL falls back to info rather than silently dropping everything', () => {
  const env = { LOG_LEVEL: 'not-a-real-level' } as NodeJS.ProcessEnv;
  const { stdout } = captureConsole(() => logger.info('still logs', {}, env));
  assert.equal(stdout.length, 1);
});
