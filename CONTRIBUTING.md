# Contributing / 参与贡献

Thanks for helping! Issues, pull requests and co-maintainers are all welcome.
感谢参与！欢迎提 Issue、PR，也欢迎成为共同维护者。

## Reporting a problem / 反馈问题

Please include / 请附上：

- OS and Claude desktop version (Help → About) / 操作系统与 Claude 桌面端版本（帮助 → 关于）
- Output of `--list` with titles removed if they are private / `--list` 的输出（标题涉及隐私可删掉）
- What you expected and what happened / 预期结果与实际结果

Never paste the contents of `local_*.json` files: they can contain paths, prompts and connector details. Field **names** are enough.
不要贴 `local_*.json` 的内容，里面可能有路径、提示词和连接器信息；贴字段**名**就够了。

## Development / 开发

```bash
git clone https://github.com/EricZehuaChang/claude-desktop-account-sessions
cd claude-desktop-account-sessions
npm test            # node --test, no dependencies / 无依赖
```

- The whole tool is one file: `skills/claude-account-sessions/scripts/claude-account-sessions.mjs`. Keep it dependency-free and runnable with Node 18.
  整个工具就是一个文件，保持零依赖、Node 18 可运行。
- Tests build a fake data folder; they never touch your real Claude data.
  测试使用临时伪造的数据目录，不会碰你真实的 Claude 数据。
- Every user-facing message exists in both `en` and `zh` in the `M` table.
  所有面向用户的提示在 `M` 表里都要有 `en` 和 `zh` 两份。

## When the app adds new fields / App 新增字段时

The CLI prints "fields this tool has not seen before" when an index entry has a field outside `KNOWN`. Decide which bucket it belongs to:
当索引里出现 `KNOWN` 之外的字段时，CLI 会提示"本工具没见过的字段"。请判断它属于哪一类：

- `DROP`: tied to the old account, a remote/cloud link, or a single app run / 绑定旧账号、远程/云端链接或某次运行
- `RESET`: must take the signed-in account's value / 必须换成当前账号的值
- otherwise add it to `KNOWN` (copied as-is) / 否则加入 `KNOWN`（原样复制）

Add a test case when you change these lists. 改这几个列表时请补测试。

## Testing on a new platform / 在新平台上实测

1. `--list` first and check the counts look right. 先跑 `--list`，看数量是否合理。
2. Import one session with `--session <id> --yes`, restart Claude, open it, check the history shows and you can send a message (ask the model to reply with one word only). 用 `--session <id> --yes` 导入一条，重启 Claude，打开它，确认历史完整、能发消息（让模型只回一个词即可）。
3. `--undo` and restart; the session should be gone again. 再 `--undo` 并重启，会话应当消失。
4. Open a PR updating the compatibility table in both READMEs. 提 PR 更新两份 README 的兼容性表。
