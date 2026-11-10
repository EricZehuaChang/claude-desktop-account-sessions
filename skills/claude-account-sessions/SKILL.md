---
name: claude-account-sessions
description: Bring back Claude desktop Code sidebar sessions after switching Claude accounts on the same computer. Use when the user says old sessions / chat history disappeared from the Claude desktop (Code tab) sidebar after signing in with another account, or asks to import, migrate or restore sessions from another local Claude account. 中文触发：切换 Claude 账号后左侧栏看不到历史会话、找回/导入/迁移旧账号的会话。
---

# claude-account-sessions

Transcripts of Claude Code sessions are stored once per computer in `~/.claude/projects/`, but the Claude desktop sidebar keeps a separate index per account. After switching accounts the old sessions are still on disk, just not listed. This skill copies the old account's index entries into the signed-in account.

The CLI is `scripts/claude-account-sessions.mjs` in this skill's directory (Node 18+, no dependencies).

## Steps

1. Show what can be imported (read-only):
   ```bash
   node "<this skill's directory>/scripts/claude-account-sessions.mjs" --list
   ```
   Summarise for the user: the signed-in account, the other account(s), how many sessions are importable / already present / skipped and why, and whether connectors differ. Reply in the user's language (`--lang zh` or `--lang en`).

2. Ask the user to confirm. Do not import without an explicit yes.

3. Import:
   ```bash
   node "<this skill's directory>/scripts/claude-account-sessions.mjs" --yes
   ```
   Add `--session <id-prefix>[,...]` to import only some sessions, `--include-no-cwd` for sessions whose working folder no longer exists.

4. Tell the user:
   - Fully quit Claude (tray / menu bar → Quit) and open it again. The app reads the sidebar index only at startup.
   - If this conversation itself runs inside the Claude desktop app, the restart ends it; that is expected.
   - When resuming an imported session, the model continues from that session's last state. If it had an unfinished task (for example "deploy when done"), the first new message should say clearly what to do.
   - If connectors are reported missing, add them in Claude → Settings → Connectors. Local MCP servers, plugins, hooks and skills in `~/.claude` are shared by all accounts already.

5. Undo, if asked:
   ```bash
   node "<this skill's directory>/scripts/claude-account-sessions.mjs" --undo
   ```
   This moves the files imported last time back out (into the backup folder), then the user restarts Claude.

## Notes

- Archived sessions are skipped in this version.
- The tool never writes to the old account's folder and never touches transcripts. Before writing it backs up the signed-in account's folder to `~/.claude-account-sessions/backups/`.
- If the signed-in account cannot be detected, the CLI prints the account folders it found; pass `--to <uuid-prefix>`.
