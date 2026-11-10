// End-to-end tests against a fake Claude desktop data folder.
// Run: npm test   (node --test)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'claude-account-sessions', 'scripts', 'claude-account-sessions.mjs');
const OLD = 'aaaaaaaa-0000-4000-8000-000000000001';
const NEW = 'bbbbbbbb-0000-4000-8000-000000000002';
const ORG_OLD = 'cccccccc-0000-4000-8000-000000000003';
const ORG_NEW = 'dddddddd-0000-4000-8000-000000000004';
const CONN_NEW = [{ uuid: 'conn-new', name: 'New connector', url: 'https://example.com/mcp' }];

/** Build a fake layout: data dir with two accounts, a ~/.claude with transcripts, a state dir. */
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cas-'));
  const data = path.join(root, 'data');
  const claude = path.join(root, 'claude');
  const state = path.join(root, 'state');
  const oldDir = path.join(data, 'claude-code-sessions', OLD, ORG_OLD);
  const newDir = path.join(data, 'claude-code-sessions', NEW, ORG_NEW);
  fs.mkdirSync(oldDir, { recursive: true });
  fs.mkdirSync(newDir, { recursive: true });
  fs.mkdirSync(path.join(claude, 'projects', 'proj'), { recursive: true });
  fs.writeFileSync(path.join(data, 'config.json'), JSON.stringify({ lastKnownAccountUuid: NEW }));
  const session = (id, extra = {}) => ({
    sessionId: `local_${id}`, cliSessionId: `cli-${id}`, cwd: root, title: `t-${id}`, lastActivityAt: 1000,
    bridgeSessionIds: ['b'], toolSurfaceSnapshot: { x: 1 }, remoteMcpServersConfig: [{ uuid: 'conn-old', name: 'Old connector' }],
    ...extra,
  });
  const put = (dir, s) => fs.writeFileSync(path.join(dir, `${s.sessionId}.json`), JSON.stringify(s));
  const transcript = (id) => fs.writeFileSync(path.join(claude, 'projects', 'proj', `cli-${id}.jsonl`), '{}\n');
  put(oldDir, session('ok1')); transcript('ok1');
  put(oldDir, session('ok2', { someNewField: 1 })); transcript('ok2');
  put(oldDir, session('notx'));                                   // no transcript
  put(oldDir, session('arch', { isArchived: true })); transcript('arch');
  put(oldDir, session('gone', { cwd: path.join(root, 'missing') })); transcript('gone');
  put(newDir, { sessionId: 'local_mine', cliSessionId: 'cli-mine', cwd: root, lastActivityAt: 2000, remoteMcpServersConfig: CONN_NEW });
  fs.writeFileSync(path.join(oldDir, 'deleted_x'), 'x');          // not a session
  return { root, data, claude, state, oldDir, newDir };
}

function run(fx, ...args) {
  const r = spawnSync(process.execPath, [CLI, '--data-dir', fx.data, '--lang', 'en', ...args], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: fx.claude, CLAUDE_ACCOUNT_SESSIONS_HOME: fx.state },
    encoding: 'utf8', input: '',
  });
  return { code: r.status, out: r.stdout + r.stderr };
}
const listDir = (d) => fs.readdirSync(d).sort();

test('--list classifies sessions and writes nothing', () => {
  const fx = fixture();
  const before = listDir(fx.newDir);
  const r = run(fx, '--list');
  assert.equal(r.code, 0);
  assert.match(r.out, /importable 2, already here 0, transcript missing 1, working folder missing 1, archived \(skipped\) 1/);
  assert.match(r.out, /missing in this one: Old connector/);
  assert.deepEqual(listDir(fx.newDir), before);
  assert.equal(fs.existsSync(fx.state), false);
});

test('without --yes on a non-interactive stdin it only shows', () => {
  const fx = fixture();
  const r = run(fx);
  assert.equal(r.code, 0);
  assert.match(r.out, /Run again with --yes/);
  assert.deepEqual(listDir(fx.newDir), ['local_mine.json']);
});

test('--yes imports, drops account-bound fields, uses target connectors, backs up', () => {
  const fx = fixture();
  const r = run(fx, '--yes');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Imported 2 session/);
  assert.match(r.out, /someNewField/);                            // unknown field reported
  assert.deepEqual(listDir(fx.newDir), ['local_mine.json', 'local_ok1.json', 'local_ok2.json']);
  const j = JSON.parse(fs.readFileSync(path.join(fx.newDir, 'local_ok1.json'), 'utf8'));
  assert.equal(j.title, 't-ok1');
  assert.equal(j.bridgeSessionIds, undefined);
  assert.equal(j.toolSurfaceSnapshot, undefined);
  assert.deepEqual(j.remoteMcpServersConfig, CONN_NEW);
  // the source folder is untouched
  assert.ok(fs.readFileSync(path.join(fx.oldDir, 'local_ok1.json'), 'utf8').includes('bridgeSessionIds'));
  // backup holds the pre-import target folder
  const backups = fs.readdirSync(path.join(fx.state, 'backups'));
  assert.deepEqual(listDir(path.join(fx.state, 'backups', backups[0], 'target')), ['local_mine.json']);
});

test('running twice imports nothing new', () => {
  const fx = fixture();
  run(fx, '--yes');
  const r = run(fx, '--yes');
  assert.match(r.out, /already here 2/);
  assert.match(r.out, /Nothing to import/);
});

test('--include-no-cwd and --session filters', () => {
  const fx = fixture();
  const r = run(fx, '--yes', '--include-no-cwd', '--session', 'local_gone');
  assert.match(r.out, /Imported 1 session/);
  assert.deepEqual(listDir(fx.newDir), ['local_gone.json', 'local_mine.json']);
});

test('--undo moves imported files out and keeps the rest', () => {
  const fx = fixture();
  run(fx, '--yes');
  const r = run(fx, '--undo');
  assert.equal(r.code, 0);
  assert.match(r.out, /moved out 2 file/);
  assert.deepEqual(listDir(fx.newDir), ['local_mine.json']);
  assert.match(run(fx, '--undo').out, /No import to undo/);
});

test('--to is required when the signed-in account is unknown', () => {
  const fx = fixture();
  fs.writeFileSync(path.join(fx.data, 'config.json'), '{}');
  const r = run(fx, '--list');
  assert.equal(r.code, 2);
  assert.match(r.out, /Use --to/);
  assert.equal(run(fx, '--list', '--to', 'bbbbbbbb').code, 0);
});
