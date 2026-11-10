# claude-desktop-account-sessions

**English** | [简体中文](README.zh-CN.md)

Switched to another Claude account on the same computer and your **Claude desktop (Code tab) sidebar is empty**? Your old sessions are still on disk. This tool puts them back into the sidebar of the account you are signed in with now, so you can open and continue them.

- One command, zero dependencies (Node.js 18+)
- Read-only preview first, asks before writing, never overwrites
- Backs up before writing, one-command undo
- Also ships as a Claude Code skill / plugin, so Claude can do it for you
- English and Chinese output

> Unofficial. Not affiliated with Anthropic. It relies on the desktop app's internal file layout, which may change in future versions.

## Quick start

```bash
npx github:EricZehuaChang/claude-desktop-account-sessions
```

It shows what it found and asks:

```
Signed-in account: bbbbbbbb/dddddddd  (3 sessions in the sidebar)
Other account: aaaaaaaa/cccccccc  (151 sessions)
  importable 139, already here 0, transcript missing 0, working folder missing 1, archived (skipped) 10
Connectors: same as the signed-in account.
Import 139 session(s) into the signed-in account? [y/N]
```

Answer `y`, then **fully quit Claude** (tray / menu bar → Quit) **and open it again**. The app reads the sidebar list only at startup.

No `npx`? Download [`claude-account-sessions.mjs`](skills/claude-account-sessions/scripts/claude-account-sessions.mjs) and run `node claude-account-sessions.mjs`.

### Let Claude do it (skill / plugin)

In Claude Code:

```
/plugin marketplace add EricZehuaChang/claude-desktop-account-sessions
/plugin install claude-account-sessions@claude-account-sessions
```

Then ask: *"My old sessions disappeared after I switched Claude accounts, bring them back."*

## Before you resume an imported session

The model continues from where that session stopped. If it had an unfinished task (say "fix it and deploy"), a bare "hi" can make it pick that task up again. Make your first message say exactly what you want.

## Options

| Option | What it does |
| --- | --- |
| *(none)* | show, ask, import |
| `--list` | only show (lists every session), change nothing |
| `--yes`, `-y` | import without asking |
| `--undo [manifest]` | undo the last import (or a given one) |
| `--session <ids>` | only these sessions (id prefixes, comma separated) |
| `--from <id>` / `--to <id>` | pick source / target account by uuid prefix |
| `--include-no-cwd` | also import sessions whose working folder no longer exists |
| `--data-dir <path>` | Claude desktop data folder, if auto-detection fails |
| `--lang zh\|en` | output language (default: system locale) |

## How it works

| What | Where | Per account? |
| --- | --- | --- |
| Conversation transcripts | `~/.claude/projects/<folder>/<id>.jsonl` | No, shared |
| Sidebar list | `<Claude data>/claude-code-sessions/<account>/<org>/local_<id>.json` | **Yes** |
| Local MCP servers, plugins, hooks, skills | `~/.claude.json`, `~/.claude/` | No, shared |
| Connectors (claude.ai) | your account, server side | Yes |

The tool copies sidebar entries from the other account(s) into the signed-in one:

- fields tied to the old account or to one app run (remote-control links, cloud environment ids, published artifacts, tool-surface snapshots) are dropped; the app recreates what it needs when you open the session;
- the connector list is replaced with the signed-in account's own, so a resumed session mounts this account's connectors;
- transcripts and the old account's folder are only read, never modified.

It reports connectors the old account used that this account does not have; add those in Claude → Settings → Connectors.

**Safety:** before writing, the signed-in account's folder is copied to `~/.claude-account-sessions/backups/<time>/`, and a manifest of imported files goes to `~/.claude-account-sessions/manifests/`. Existing sessions are never overwritten, so running it twice is harmless. `--undo` moves the imported files back out (to the backup folder, not deleted).

## Compatibility

| Platform | Status |
| --- | --- |
| Windows 11, Claude desktop from Microsoft Store / MSIX (4.23118.x) | Tested end to end: sessions appear after restart and can be resumed |
| Windows installer build (`%APPDATA%\Claude`) | Detected, not yet tested |
| macOS (`~/Library/Application Support/Claude`) | Detected, not yet tested |
| Linux (`~/.config/Claude`) | Detected, not yet tested |

Reports from other platforms are very welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Limitations

- Archived sessions are skipped for now (unarchive them in the old account first).
- Claude must be restarted to see the imported sessions.
- Only sessions stored on this computer are handled; cloud sessions are not.

## Contributing

Issues and pull requests are welcome, and so are co-maintainers. Start with [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
