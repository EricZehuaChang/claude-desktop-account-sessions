# claude-desktop-account-sessions

[English](README.md) | **简体中文**

同一台电脑上切换了 Claude 账号，**Claude 桌面端（Code 标签页）左侧栏的历史会话全没了**？其实这些会话都还在硬盘上。这个工具把它们放回当前登录账号的侧栏，打开就能接着聊。

- 一条命令，零依赖（Node.js 18+）
- 先只读预览，写入前询问，绝不覆盖
- 写入前自动备份，一条命令撤回
- 同时提供 Claude Code skill / 插件，可以让 Claude 帮你做
- 中英文输出

> 非官方工具，与 Anthropic 无关。它依赖桌面端内部的文件结构，App 升级后可能需要跟着调整。

## 快速开始

```bash
npx github:EricZehuaChang/claude-desktop-account-sessions
```

它会先列出找到的内容，再问你：

```
当前登录账号: bbbbbbbb/dddddddd（侧栏现有 3 条会话）
其他账号: aaaaaaaa/cccccccc（151 条会话）
  可导入 139，已存在 0，缺对话记录 0，工作目录已不存在 1，已归档（跳过）10
连接器：与当前账号一致。
把 139 条会话导入当前登录账号？[y/N]
```

输入 `y`，然后**完全退出 Claude**（托盘/菜单栏图标 → 退出）**再重新打开**。App 只在启动时读取侧栏列表。

没有 `npx`？下载 [`claude-account-sessions.mjs`](skills/claude-account-sessions/scripts/claude-account-sessions.mjs)，运行 `node claude-account-sessions.mjs`。

### 让 Claude 来做（skill / 插件）

在 Claude Code 里：

```
/plugin marketplace add EricZehuaChang/claude-desktop-account-sessions
/plugin install claude-account-sessions@claude-account-sessions
```

然后说：*"切换账号后左侧栏看不到以前的会话了，帮我找回来。"*

## 续聊导入的会话之前

模型会从那条会话停下的地方接着来。如果它当时有没做完的任务（比如"改完推到服务器"），你只发一句"你好"，它可能就接着去做那个任务。第一句话请明确说你要它做什么。

## 选项

| 选项 | 作用 |
| --- | --- |
| *（不带）* | 列出、询问、导入 |
| `--list` | 只列出（逐条显示），不做任何改动 |
| `--yes`, `-y` | 不询问直接导入 |
| `--undo [清单]` | 撤回最近一次导入（或指定清单） |
| `--session <ids>` | 只导入这些会话（id 前缀，逗号分隔） |
| `--from <id>` / `--to <id>` | 按 uuid 前缀指定来源 / 目标账号 |
| `--include-no-cwd` | 工作目录已不存在的会话也导入 |
| `--data-dir <路径>` | 自动查找失败时，手动指定 Claude 桌面端数据目录 |
| `--lang zh\|en` | 输出语言（默认跟随系统） |

## 原理

| 内容 | 位置 | 分账号吗 |
| --- | --- | --- |
| 对话记录 | `~/.claude/projects/<目录>/<id>.jsonl` | 不分，共用 |
| 侧栏列表 | `<Claude 数据目录>/claude-code-sessions/<账号>/<组织>/local_<id>.json` | **分** |
| 本地 MCP、插件、hooks、skills | `~/.claude.json`、`~/.claude/` | 不分，共用 |
| 连接器（claude.ai） | 账号服务端 | 分 |

工具把其他账号的侧栏条目复制到当前账号：

- 绑定旧账号或某次运行的字段（远程控制链接、云环境 id、已发布的 artifact、工具快照）会丢弃，打开会话时 App 自己重建；
- 连接器列表换成当前账号自己的，续聊时挂载的是当前账号的连接器；
- 对话记录和旧账号目录只读，不修改。

旧账号用过、当前账号没有的连接器会列出来，请在 Claude → 设置 → 连接器 里添加。

**安全**：写入前把当前账号目录整体备份到 `~/.claude-account-sessions/backups/<时间>/`，导入清单存到 `~/.claude-account-sessions/manifests/`。已存在的会话不会被覆盖，重复运行没有副作用。`--undo` 把导入的文件移出去（放进备份目录，不删除）。

## 兼容性

| 平台 | 状态 |
| --- | --- |
| Windows 11，微软商店 / MSIX 版 Claude 桌面端（4.23118.x） | 已端到端实测：重启后会话出现在侧栏，可以续聊 |
| Windows 安装包版（`%APPDATA%\Claude`） | 能识别，未实测 |
| macOS（`~/Library/Application Support/Claude`） | 能识别，未实测 |
| Linux（`~/.config/Claude`） | 能识别，未实测 |

欢迎反馈其他平台的结果，见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 限制

- 暂时跳过已归档的会话（需要的话先在旧账号里取消归档）。
- 要重启 Claude 才能看到导入的会话。
- 只处理存在本机的会话，不处理云端会话。

## 参与贡献

欢迎提 Issue、PR，也欢迎一起维护。先看 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE)
