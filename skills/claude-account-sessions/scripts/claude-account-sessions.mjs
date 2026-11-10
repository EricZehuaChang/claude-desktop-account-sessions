#!/usr/bin/env node
// claude-account-sessions
//
// Bring back Claude desktop "Code" sidebar sessions after switching to another
// Claude account on the same computer.
//
// Why sessions "disappear": the conversation transcripts live in
// ~/.claude/projects/<encoded-cwd>/<cliSessionId>.jsonl and are shared by every
// account, but the sidebar list is a separate per-account index:
//   <userData>/claude-code-sessions/<accountUuid>/<orgUuid>/local_<id>.json
// The app only lists the index of the signed-in account. This tool copies the
// index entries of your other local account(s) into the signed-in one, drops the
// fields that are bound to the old account, and points connectors at the
// signed-in account's set. Transcripts are never modified.
//
// Safety:
//   - --list never writes. The default mode asks before writing.
//   - The old account's folder is only read.
//   - Before writing, the signed-in account's folder is copied to
//     <state>/backups/<stamp>/ and a manifest is saved in <state>/manifests/.
//   - Never overwrites an existing session; a session already present (same id
//     or same transcript) is skipped, so running twice is harmless.
//   - --undo moves the imported files back out (into the backup folder).
//
// Zero dependencies, Node >= 18. Tested on Windows 11 with Claude desktop 4.23118.x.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';

// ---------- arguments ----------
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const flag = (...names) => names.some((n) => argv.includes(n));

// ---------- language ----------
// zh when --lang zh, or when the system locale is Chinese; English otherwise.
const LANG = opt('--lang') || ((Intl.DateTimeFormat().resolvedOptions().locale || process.env.LANG || '').toLowerCase().startsWith('zh') ? 'zh' : 'en');
const M = {
  en: {
    help: `Usage: claude-account-sessions [options]

  (no options)          show what can be imported, ask, then import
  --list                only show, change nothing
  --yes, -y             import without asking
  --undo [manifest]     undo the last import (or the given manifest)
  --session <ids>       only these sessions (id prefixes, comma separated)
  --from <id>           source account/org uuid prefix (default: every other account)
  --to <id>             target account/org uuid prefix (default: the signed-in account)
  --include-no-cwd      also import sessions whose working folder no longer exists
  --data-dir <path>     Claude desktop data folder (auto-detected)
  --lang zh|en          output language

After importing, fully quit Claude (also from the tray / menu bar) and open it again.`,
    noData: 'Claude desktop data folder not found (no claude-code-sessions inside). Use --data-dir.',
    noTarget: 'Cannot tell which account is signed in. Use --to <uuid prefix>. Accounts found:',
    dataDir: (p) => `Claude desktop data: ${p}`,
    target: (id, n) => `Signed-in account: ${id}  (${n} sessions in the sidebar)`,
    source: (id, n) => `Other account: ${id}  (${n} sessions)`,
    nothingElse: 'No other account found on this computer. Nothing to import.',
    summary: (c) => `  importable ${c.ok}, already here ${c.present}, transcript missing ${c.noTranscript}, working folder missing ${c.noCwd}, archived (skipped) ${c.archived}`,
    noCwdHint: '  Sessions whose working folder is gone are skipped; add --include-no-cwd to import them anyway.',
    archivedHint: '  Archived sessions are skipped in this version; unarchive them in the old account first if you need them.',
    connSame: 'Connectors: same as the signed-in account.',
    connMissing: (l) => `Connectors used by the old account but missing in this one: ${l}. Add them in Claude → Settings → Connectors.`,
    connNote: 'Local MCP servers, plugins, hooks and skills in ~/.claude are shared files, so both accounts already see the same ones.',
    ask: (n) => `Import ${n} session(s) into the signed-in account? [y/N] `,
    nonTty: 'Not an interactive terminal: showing only. Run again with --yes to import.',
    none: 'Nothing to import.',
    aborted: 'Cancelled. Nothing was changed.',
    backupFail: 'Backup check failed (file count differs). Stopped before writing anything.',
    done: (n, b) => `Imported ${n} session(s). Backup: ${b}`,
    restart: 'Now fully quit Claude (tray / menu bar → Quit) and open it again; the sessions appear in the sidebar.',
    undoHint: (cmd) => `To undo: ${cmd}`,
    unknownFields: (l) => `Note: fields this tool has not seen before were copied as-is: ${l}`,
    noManifest: 'No import to undo.',
    undone: (n, c, g, p) => `Undone: moved out ${n} file(s) (${c} changed by the app since import), ${g} already gone. Moved files are in ${p}. Restart Claude to refresh the sidebar.`,
    status: { ok: 'import', present: 'already here', noTranscript: 'no transcript', noCwd: 'folder missing', archived: 'archived' },
  },
  zh: {
    help: `用法: claude-account-sessions [选项]

  (不带选项)            列出可导入的会话，询问后导入
  --list                只列出，不做任何改动
  --yes, -y             不询问，直接导入
  --undo [清单]         撤回最近一次导入（或指定清单）
  --session <ids>       只导入这些会话（id 前缀，逗号分隔）
  --from <id>           来源账号/组织 uuid 前缀（默认：其余所有账号）
  --to <id>             目标账号/组织 uuid 前缀（默认：当前登录账号）
  --include-no-cwd      工作目录已不存在的会话也导入
  --data-dir <路径>     Claude 桌面端数据目录（默认自动查找）
  --lang zh|en          输出语言

导入后请完全退出 Claude（包括托盘/菜单栏图标）再重新打开。`,
    noData: '找不到 Claude 桌面端数据目录（里面没有 claude-code-sessions）。请用 --data-dir 指定。',
    noTarget: '判断不出当前登录的是哪个账号，请用 --to <uuid 前缀> 指定。找到的账号：',
    dataDir: (p) => `Claude 桌面端数据目录: ${p}`,
    target: (id, n) => `当前登录账号: ${id}（侧栏现有 ${n} 条会话）`,
    source: (id, n) => `其他账号: ${id}（${n} 条会话）`,
    nothingElse: '本机没有其他账号的会话，无需导入。',
    summary: (c) => `  可导入 ${c.ok}，已存在 ${c.present}，缺对话记录 ${c.noTranscript}，工作目录已不存在 ${c.noCwd}，已归档（跳过）${c.archived}`,
    noCwdHint: '  工作目录已不存在的会话默认跳过；需要的话加 --include-no-cwd。',
    archivedHint: '  本版本跳过已归档会话；需要的话先在旧账号里取消归档。',
    connSame: '连接器：与当前账号一致。',
    connMissing: (l) => `旧账号用过、当前账号没有的连接器：${l}。请在 Claude → 设置 → 连接器 里添加。`,
    connNote: '~/.claude 里的本地 MCP、插件、hooks、skills 是同一份文件，两个账号本来就一样。',
    ask: (n) => `把 ${n} 条会话导入当前登录账号？[y/N] `,
    nonTty: '不是交互终端，只列出不导入。确认要导入请加 --yes 再运行。',
    none: '没有可导入的会话。',
    aborted: '已取消，没有做任何改动。',
    backupFail: '备份校验失败（文件数不一致），已在写入前中止。',
    done: (n, b) => `已导入 ${n} 条会话。备份: ${b}`,
    restart: '现在请完全退出 Claude（托盘/菜单栏 → 退出）再重新打开，会话就会出现在左侧栏。',
    undoHint: (cmd) => `撤回命令: ${cmd}`,
    unknownFields: (l) => `提示：以下字段本工具没见过，已原样复制：${l}`,
    noManifest: '没有可撤回的导入。',
    undone: (n, c, g, p) => `已撤回：移出 ${n} 个文件（其中导入后被 App 改过 ${c} 个），本来就不在 ${g} 个。移出的文件在 ${p}。重启 Claude 后侧栏刷新。`,
    status: { ok: '可导入', present: '已存在', noTranscript: '缺对话记录', noCwd: '目录不存在', archived: '已归档' },
  },
}[LANG === 'zh' ? 'zh' : 'en'];

if (flag('--help', '-h')) { console.log(M.help); process.exit(0); }

// ---------- locations ----------
const STATE_DIR = process.env.CLAUDE_ACCOUNT_SESSIONS_HOME || path.join(os.homedir(), '.claude-account-sessions');
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const short = (s) => (s ? s.slice(0, 8) : '-');
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

/** Candidate desktop data folders per platform; the most recently used one wins. */
function findDataDir() {
  if (opt('--data-dir')) return opt('--data-dir');
  const c = [];
  const local = process.env.LOCALAPPDATA;
  if (local && isDir(path.join(local, 'Claude-Data'))) {          // Windows Store (MSIX) install
    for (const d of fs.readdirSync(path.join(local, 'Claude-Data'))) c.push(path.join(local, 'Claude-Data', d));
  }
  if (process.env.APPDATA) c.push(path.join(process.env.APPDATA, 'Claude'));          // Windows installer
  c.push(path.join(os.homedir(), 'Library', 'Application Support', 'Claude'));       // macOS
  c.push(path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'Claude')); // Linux
  const found = c.filter((d) => isDir(path.join(d, 'claude-code-sessions')));
  const mtime = (d) => { try { return fs.statSync(path.join(d, 'config.json')).mtimeMs; } catch { return 0; } };
  return found.sort((a, b) => mtime(b) - mtime(a))[0];
}

// ---------- field policy ----------
// DROP: bound to the old account, a remote/cloud link, or a single app run.
//       The app re-creates what it needs the next time the session is opened.
// RESET: replaced with the signed-in account's value.
// Everything else is copied as-is (title, cwd, model, timestamps, permissions...).
const DROP = new Set([
  'bridgeSessionIds', 'envScopeId', 'startedFromEnvironmentId',            // remote control / cloud environment
  'remoteControlAutoEligible', 'remoteControlUserEnabled', 'steeredByRemoteClient',
  'publishedArtifacts',                                                     // artifacts belong to the old account
  'toolSurfaceSnapshot', 'promptAppendSnapshot',                            // the old run's tool surface
  'chromeTabGroupId', 'terminalClaudeTabOrdinal',                           // per-run UI handles
  'queuedSideSessionNotes', 'pendingSystemReminder', 'interruptedAwaitingPerson',
  'resolvedBackgroundTaskSuggestions', 'subagentsTruncatedFor',
]);
const RESET = new Set(['remoteMcpServersConfig']);
// Fields observed in real index files (2026-11). Anything else is still copied,
// but listed once so maintainers notice new app fields.
const KNOWN = new Set([...DROP, ...RESET,
  'sessionId', 'cliSessionId', 'priorCliSessionIds', 'priorCliSessionLeftAt', 'lastAssistantCliSessionId', 'cwd', 'originCwd',
  'gitAnchors', 'gitAnchorsFolderRealpath', 'gitAnchorsLookupOnly', 'shellFolders', 'createdAt', 'lastActivityAt', 'lastFocusedAt',
  'lastTurnEdgeAt', 'latestUserFrameAt', 'indexedAt', 'model', 'effort', 'isArchived', 'title', 'titleSource', 'titleTurn',
  'previousTitles', 'permissionMode', 'chromePermissionMode', 'chromeAllowedDomains', 'bypassChosenInApp', 'autoChosenInApp',
  'autoModeServerFallbackPrompt', 'alwaysAllowedReasons', 'sessionPermissionUpdates', 'sessionSettings', 'classifierSummaryEnabled',
  'reportFindingsCard', 'turnBoxDeclared', 'turnBoxMounted', 'completedTurns', 'lastAssistantUuid', 'postTurnSummary',
  'postTurnSummaryFor', 'turnWrapUp', 'lastTurnReport', 'promptSuggestion', 'spawnSeed', 'lastSpawnRootDetected', 'spawnedFrom',
  'forkedFromSessionId', 'forkedAtMessageUuid', 'writtenBranches', 'branch', 'sourceBranch', 'prs', 'devIntents', 'rewindEdges',
  'transcriptModelStates', 'error', 'errorAt', 'errorRows', 'priorErrorMark', 'lastTurnCutShort', 'contextExceededCount', 'peerMessaged',
]);

// ---------- undo ----------
if (flag('--undo')) {
  const given = opt('--undo');
  const mdir = path.join(STATE_DIR, 'manifests');
  let mf = given && !given.startsWith('--') ? given : undefined;
  if (!mf && isDir(mdir)) {
    // Latest manifest that has not been undone yet.
    mf = fs.readdirSync(mdir).filter((f) => f.endsWith('.json')).sort().reverse()
      .map((f) => path.join(mdir, f)).find((f) => !readJson(f)?.undoneAt);
  }
  const m = mf && readJson(mf);
  if (!m?.files) { console.log(M.noManifest); process.exit(0); }
  const parked = path.join(m.backupDir, 'undone');
  fs.mkdirSync(parked, { recursive: true });
  let moved = 0, changed = 0, gone = 0;
  for (const f of m.files) {
    const p = path.join(m.targetDir, f.file);
    if (!fs.existsSync(p)) { gone++; continue; }
    // The app rewrites the file when the session is opened; still safe to move out.
    if (sha256(fs.readFileSync(p, 'utf8')) !== f.sha256) changed++;
    fs.renameSync(p, path.join(parked, f.file));
    moved++;
  }
  m.undoneAt = new Date().toISOString();
  fs.writeFileSync(mf, JSON.stringify(m, null, 2));
  console.log(M.undone(moved, changed, gone, parked));
  process.exit(0);
}

// ---------- discover ----------
const dataDir = findDataDir();
if (!dataDir) { console.error(M.noData); process.exit(2); }
const sessRoot = path.join(dataDir, 'claude-code-sessions');
const appConfig = readJson(path.join(dataDir, 'config.json')) || {};

/** Every <account>/<org> folder with its readable session index entries. */
const folders = [];
for (const acct of fs.readdirSync(sessRoot)) {
  if (!isDir(path.join(sessRoot, acct))) continue;
  for (const org of fs.readdirSync(path.join(sessRoot, acct))) {
    const dir = path.join(sessRoot, acct, org);
    if (!isDir(dir)) continue;
    const sessions = [];
    let newest = 0;
    for (const f of fs.readdirSync(dir)) {
      if (!/^local_.*\.json$/.test(f)) continue;    // deleted_* markers, backlog/, waiting-input/ are not sessions
      const j = readJson(path.join(dir, f));
      if (!j?.sessionId) continue;
      sessions.push({ file: f, data: j });
      newest = Math.max(newest, j.lastActivityAt || 0);
    }
    folders.push({ acct, org, dir, sessions, newest, label: `${short(acct)}/${short(org)}` });
  }
}

// Target: --to, else the account the app last signed in with (its most recently used org).
const match = (p) => folders.filter((f) => f.acct.startsWith(p) || f.org.startsWith(p));
const toKey = opt('--to') || appConfig.lastKnownAccountUuid;
const target = toKey ? match(toKey).sort((a, b) => b.newest - a.newest)[0] : undefined;
if (!target) {
  console.error(M.noTarget);
  for (const f of folders) console.error(`  ${f.acct}/${f.org}  (${f.sessions.length})`);
  process.exit(2);
}
const sources = (opt('--from') ? match(opt('--from')) : folders).filter((f) => f !== target);

// Transcripts: <claudeDir>/projects/<encoded-cwd>/<cliSessionId>.jsonl, shared by all accounts.
const transcripts = new Set();
const projRoot = path.join(CLAUDE_DIR, 'projects');
if (isDir(projRoot)) {
  for (const p of fs.readdirSync(projRoot)) {
    if (!isDir(path.join(projRoot, p))) continue;
    for (const n of fs.readdirSync(path.join(projRoot, p))) if (n.endsWith('.jsonl')) transcripts.add(n.slice(0, -6));
  }
}

// ---------- classify ----------
const haveIds = new Set(target.sessions.map((s) => s.data.sessionId));
const haveCli = new Set(target.sessions.map((s) => s.data.cliSessionId).filter(Boolean));
const wanted = (opt('--session') || '').split(',').map((s) => s.trim()).filter(Boolean);
const rows = [];
for (const src of sources) {
  for (const s of src.sessions) {
    const j = s.data;
    if (wanted.length && !wanted.some((w) => j.sessionId.startsWith(w) || j.cliSessionId?.startsWith(w))) continue;
    let status;
    if (haveIds.has(j.sessionId) || (j.cliSessionId && haveCli.has(j.cliSessionId))) status = 'present';
    else if (!transcripts.has(j.cliSessionId)) status = 'noTranscript';
    else if (j.isArchived) status = 'archived';
    else if (j.cwd && !fs.existsSync(j.cwd)) status = 'noCwd';
    else status = 'ok';
    rows.push({ src, ...s, status });
  }
}
const importable = rows.filter((r) => r.status === 'ok' || (r.status === 'noCwd' && flag('--include-no-cwd')));

// ---------- connectors ----------
// The signed-in account's connector set is taken from its most recent session,
// i.e. what the app mounted for this account last time.
const latest = (f) => [...f.sessions].sort((a, b) => (b.data.lastActivityAt || 0) - (a.data.lastActivityAt || 0))[0]?.data;
const targetConnectors = latest(target)?.remoteMcpServersConfig || [];
const targetConnIds = new Set(targetConnectors.map((c) => c.uuid || c.name));
const missingConn = new Map();
for (const r of rows) for (const c of r.data.remoteMcpServersConfig || []) if (!targetConnIds.has(c.uuid || c.name)) missingConn.set(c.uuid || c.name, c.name);

// ---------- report ----------
console.log(M.dataDir(dataDir));
console.log(M.target(target.label, target.sessions.length));
if (!sources.length) { console.log(M.nothingElse); process.exit(0); }
for (const src of sources) {
  const mine = rows.filter((r) => r.src === src);
  const c = (s) => mine.filter((r) => r.status === s).length;
  console.log(M.source(src.label, src.sessions.length));
  console.log(M.summary({ ok: c('ok'), present: c('present'), noTranscript: c('noTranscript'), noCwd: c('noCwd'), archived: c('archived') }));
  if (c('noCwd') && !flag('--include-no-cwd')) console.log(M.noCwdHint);
  if (c('archived')) console.log(M.archivedHint);
}
console.log(missingConn.size ? M.connMissing([...missingConn.values()].join(', ')) : M.connSame);
console.log(M.connNote);
if (flag('--list')) {
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (ms) => { const d = new Date(ms || 0); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  for (const r of [...rows].sort((a, b) => (b.data.lastActivityAt || 0) - (a.data.lastActivityAt || 0))) {
    console.log(`  [${M.status[r.status]}] ${fmt(r.data.lastActivityAt)}  ${r.data.sessionId.slice(0, 14)}  ${(r.data.title || '').slice(0, 40)}`);
  }
  process.exit(0);
}
if (!importable.length) { console.log(M.none); process.exit(0); }

// ---------- confirm ----------
if (!flag('--yes', '-y')) {
  if (!process.stdin.isTTY) { console.log(M.nonTty); process.exit(0); }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(M.ask(importable.length))).trim().toLowerCase();
  rl.close();
  if (!['y', 'yes', '是', '好'].includes(a)) { console.log(M.aborted); process.exit(0); }
}

// ---------- write ----------
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(STATE_DIR, 'backups', stamp);
fs.mkdirSync(backupDir, { recursive: true });
fs.cpSync(target.dir, path.join(backupDir, 'target'), { recursive: true });
const countFiles = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? countFiles(path.join(d, e.name)) : 1), 0);
if (countFiles(target.dir) !== countFiles(path.join(backupDir, 'target'))) { console.error(M.backupFail); process.exit(4); }

const manifestPath = path.join(STATE_DIR, 'manifests', `${stamp}.json`);
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
const manifest = { createdAt: new Date().toISOString(), dataDir, targetDir: target.dir, backupDir, files: [] };
const unknown = new Set();
for (const r of importable) {
  const out = {};
  for (const [k, v] of Object.entries(r.data)) {
    if (DROP.has(k) || RESET.has(k)) continue;
    if (!KNOWN.has(k)) unknown.add(k);
    out[k] = v;
  }
  out.remoteMcpServersConfig = structuredClone(targetConnectors);
  const text = JSON.stringify(out);
  const final = path.join(target.dir, r.file);
  const tmp = path.join(target.dir, `.import-${r.data.sessionId}.tmp`);   // not local_*, so the app ignores it
  if (fs.existsSync(final)) continue;
  fs.writeFileSync(tmp, text, { encoding: 'utf8', flag: 'wx' });
  if (fs.existsSync(final)) { fs.unlinkSync(tmp); continue; }
  fs.renameSync(tmp, final);
  manifest.files.push({ file: r.file, sessionId: r.data.sessionId, cliSessionId: r.data.cliSessionId, from: r.src.label, sha256: sha256(text) });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));     // stay current if interrupted
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
if (unknown.size) console.log(M.unknownFields([...unknown].join(', ')));
console.log(M.done(manifest.files.length, backupDir));
console.log(M.restart);
console.log(M.undoHint(`node "${process.argv[1]}" --undo`));
