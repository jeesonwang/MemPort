# MemPort 设计文档

## 项目概述

MemPort 是一个 npm 分发的命令行工具，用于将 Codex 的本地记忆同步到 Claude Code 项目中，使 Claude Code 能够访问用户在 Codex 中积累的项目知识和偏好设置。

### 核心目标

- 读取 Codex 生成的本地记忆文件（`~/.codex/memories/`）
- 将记忆同步到当前项目的 `.claude/` 目录
- 提供稳定的手动同步命令
- 提供 SessionStart Hook 自动同步，确保每次 Claude Code 会话开始时刷新记忆
- 通过 npm 分发安装，支持全局安装和 `npx` 一次性执行

### 非目标

- 不修改 Codex 原始记忆文件
- 不生成新的记忆内容
- 不涉及网络传输或云端同步
- 不进行记忆内容的分析或分类
- MVP 不实现 Claude Code 插件市场分发
- MVP 不依赖 Claude Code 插件机制；Hook 通过项目级或本地 settings 调用 npm CLI

---

## 技术栈

- **语言**: TypeScript / Node.js
- **分发方式**: npm package
- **安装方式**: `npm install -g memport` 或 `npx memport sync`
- **命令行工具**: `memport`

---

## 项目架构

```
MemPort/
├── bin/
│   └── memport                  # CLI 入口脚本
├── src/
│   ├── cli.ts                   # CLI 命令处理逻辑
│   ├── core.ts                  # 核心同步逻辑
│   ├── hook.ts                  # Claude Code Hook 入口逻辑
│   ├── init.ts                  # init 命令逻辑
│   └── types.ts                 # TypeScript 类型定义
├── package.json                 # npm 包配置，bin 字段注册命令
├── tsconfig.json                # TypeScript 配置
└── README.md                    # 使用文档
```

---

## 核心功能设计

### 1. 记忆同步机制

**三类同步结构：**

1. **摘要层** (`memory_summary.md`)
   - 源文件: `~/.codex/memories/memory_summary.md`
   - 目标: `.claude/CLAUDE.md` 中由 MemPort 管理的 `# Codex Memories` 区块
   - 用途: 让 Claude Code 在项目指令中看到关键记忆摘要

2. **详细层** (详细记忆文件集合)
   - 源目录: `~/.codex/memories/` 下的 allowlist 文件
   - 目标目录: `.claude/codex-memories/`
   - 用途: Claude 按需搜索详细记忆（使用 grep/Read 工具）
   - 范围: 只同步明确允许的文本记忆文件，排除 `.git/`、`.omx/`、`skills/`、临时状态文件和非文本运行数据

3. **技能层** (Claude Code Skills)
   - 源目录: `~/.codex/memories/skills/*`
   - 目标目录: `.claude/skills/*`
   - 用途: 让 Codex 记忆中的可复用 skills 以 Claude Code 原生 Skills 形式被发现
   - 范围: 每个包含 `SKILL.md` 的子目录作为一个 skill 同步，保留该 skill 目录内的支持文件

**同步流程：**

```
memport sync 执行时：

1. 验证环境
   └─ 检查 ~/.codex/memories/ 是否存在
      ├─ 不存在 → 报错退出
      └─ 存在 → 继续

2. 读取摘要
   └─ 读取 ~/.codex/memories/memory_summary.md
      ├─ 文件不存在或为空 → 提示并退出
      └─ 解析内容

3. 复制详细记忆
   └─ 复制 allowlist 内的记忆文件 → .claude/codex-memories/*
      ├─ 递归复制允许的 .md 文件
      ├─ 保留目录结构
      └─ 增量检测：比较文件大小和内容 hash，仅复制变更文件

4. 同步 skills
   └─ 复制 ~/.codex/memories/skills/* → .claude/skills/*
      ├─ 如果 .claude/skills/ 不存在则创建
      ├─ 每个包含 SKILL.md 的子目录视为一个 skill
      ├─ 保留 skill 目录内的支持文件（如 scripts/、examples/、templates/）
      ├─ 为每个由 MemPort 管理的目标 skill 写入 .memport.json 标记文件
      └─ 不复制 skills 根目录下的杂项文件（如 .DS_Store）

5. 更新 CLAUDE.md
   └─ 操作 .claude/CLAUDE.md 文件
      ├─ 文件不存在 → 创建新文件，写入托管区块
      ├─ 文件存在，无 MemPort 托管区块 → 追加托管区块
      └─ 托管区块已存在 → 替换区块内容

6. 完成
   └─ 输出成功信息
```

`memport hook session-start` 执行时：

1. 读取 Claude Code 通过 stdin 传入的 Hook JSON
2. 以 `cwd` 或 `CLAUDE_PROJECT_DIR` 作为项目根目录
3. 静默执行与 `memport sync` 相同的同步流程
4. 向 stdout 输出 Hook JSON：
   - 同步成功时，通过 `hookSpecificOutput.additionalContext` 注入本次会话可见的简短说明和摘要
   - 同步成功且写入或更新 skills 时，返回 `hookSpecificOutput.reloadSkills: true`，确保本次会话首个 prompt 就能发现同步后的 skills
   - 同步失败时，不中断会话启动，仅通过 `systemMessage` 给用户可见提示
5. 返回 0，避免因为记忆同步失败阻塞 Claude Code 启动

**默认同步 allowlist：**

- `memory_summary.md`
- `MEMORY.md`
- `raw_memories.md`
- `rollout_summaries/**/*.md`

**默认不同步的记忆扩展：**

- `extensions/ad_hoc/**/*.md`: 主要供 Codex memory 整合流程消费，不作为 Claude Code 日常检索上下文默认暴露；可通过后续配置显式开启。
- `automations/**/memory.md`: 主要记录自动化任务运行摘要，不属于默认项目记忆主链路；可通过后续配置显式开启。

**默认 skills 同步规则：**

- 只扫描 `~/.codex/memories/skills/*/SKILL.md`
- 将匹配到的 skill 目录复制到 `.claude/skills/<skill-name>/`
- 复制 skill 目录内的 `.md`、脚本、示例和模板等支持文件
- 跳过 `.git/`、`.DS_Store`、缓存目录和临时文件
- 每个 MemPort 管理的目标 skill 必须包含 `.memport.json` 标记文件，用于记录 `sourcePath`、`sourceHash`、`managedAt`、`toolVersion`
- 如果目标同名 skill 已存在但缺少有效 `.memport.json`，视为项目原生 skill，停止覆盖并提示用户处理冲突
- 如果 `~/.claude/skills/<skill-name>/SKILL.md` 已存在，输出提示：Claude Code 的个人 skill 优先级高于项目 skill，同名项目 skill 可能不会被调用

**`.memport.json` 标记文件：**

```json
{
  "managedBy": "memport",
  "sourcePath": "~/.codex/memories/skills/weekly-git-report",
  "sourceHash": "sha256:...",
  "managedAt": "2026-06-11T15:30:00+08:00",
  "toolVersion": "1.0.0"
}
```

同步时只允许覆盖带有 `managedBy: "memport"` 且 `sourcePath` 指向当前 Codex skills 目录的目标 skill。缺少该标记、标记 JSON 无法解析、或 `sourcePath` 不匹配时，都按非 MemPort 管理目录处理。

### 2. CLAUDE.md 章节管理

**章节格式：**

```markdown
<!-- MEMPORT:BEGIN -->
# Codex Memories

> 以下记忆来自 Codex，由 MemPort 同步
> 最后同步时间：2026-06-11 15:30:00
> ⚠️ 此章节由 MemPort 管理，手动修改将在下次同步时被覆盖

[memory_summary.md 的完整内容]

---

**查找详细记忆：**
如需查找特定主题的详细记忆，可以使用以下方式：
- 使用 grep 搜索：`grep -r "关键词" .claude/codex-memories/`
- 阅读索引文件：`.claude/codex-memories/MEMORY.md`
- 直接读取记忆文件：`.claude/codex-memories/*.md`
<!-- MEMPORT:END -->
```

**章节边界识别：**
- 开始标记: `<!-- MEMPORT:BEGIN -->`
- 结束标记: `<!-- MEMPORT:END -->`
- 不使用 Markdown 标题作为边界，因为 `memory_summary.md` 自身包含 `##` 标题

**替换策略：**
- 使用 HTML marker 定位托管区块
- 完整替换 marker 之间的内容
- 保持文件其他部分不变
- 修改前创建备份文件 `CLAUDE.md.backup`

### 3. 命令行接口

**命令集合：**

```bash
# 初始化当前项目（创建 .claude/ 并执行一次同步）
memport init

# 手动同步
memport sync

# Claude Code SessionStart Hook 入口
memport hook session-start

# 查看状态（可选，后续版本）
memport status

# 卸载配置（可选，后续版本）
memport uninstall
```

**`memport init` 详细设计：**

```typescript
执行流程：
1. 显示欢迎信息
2. 检查当前目录是否可以作为项目根目录
3. 创建 .claude/ 目录（如果不存在）
4. 检查并提示追加 .gitignore 规则
5. 检查是否安装 SessionStart Hook
6. 提示用户是否写入 `.claude/settings.local.json`
7. 执行一次 memport sync
8. 显示成功信息和后续手动同步命令
```

**`memport sync` 详细设计：**

```typescript
执行逻辑：
1. 检查当前目录是否有 .claude/ 或自动创建
2. 调用 core.ts 的同步函数
3. 显示详细进度：
   ✓ 读取 Codex 记忆摘要
   ✓ 复制 15 个记忆文件到 .claude/codex-memories/
   ✓ 更新 .claude/CLAUDE.md
   完成！Codex 记忆已同步到当前项目

错误处理：
- Codex 目录不存在：友好提示
- 权限问题：显示具体错误信息
- 其他错误：显示错误并退出，返回非零状态码
```

### 4. 同步性能设计

**性能优化：**
- 增量同步：比较文件大小和内容 hash，仅复制变更文件
- 快速失败：Codex 目录不存在时立即返回
- 只同步 allowlist 内的文本文件，避免复制 `.git/`、`.omx/` 等状态目录

**用户控制：**
- 用户手动运行 `memport sync` 刷新记忆
- 用户可以通过 `--codex-path` 指定非默认 Codex 记忆目录
- 用户可以通过 `memport init` 安装项目级 SessionStart Hook
- 用户可以手动删除 `.claude/settings.local.json` 中的 MemPort Hook 来关闭自动同步

### 5. SessionStart Hook 设计

MVP 不做 Claude Code 插件，但会通过 Claude Code settings 注册项目级 Hook。默认写入 `.claude/settings.local.json`，避免把本机绝对路径和自动同步策略提交到仓库。

**Hook 配置：**

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "memport hook session-start --project-root \"$CLAUDE_PROJECT_DIR\" --silent",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

**Hook 输出：**

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "reloadSkills": true,
    "additionalContext": "MemPort 已同步 Codex 记忆。摘要已写入 .claude/CLAUDE.md，详细记忆位于 .claude/codex-memories/。"
  }
}
```

`reloadSkills` 只在同步流程写入或更新 `.claude/skills/` 时必须返回。这样 Claude Code 会在 SessionStart Hook 结束后重新扫描 skill 和 command 目录，避免新同步的 Codex skills 要到下一次会话才可用。

**安装约束：**
- 如果 `memport init` 由全局安装的 `memport` 命令运行，可以直接写入上述 Hook。
- 如果 `memport init` 由一次性 `npx` 运行，默认提示用户先执行 `npm install -g memport`，否则未来会话可能找不到 `memport` 命令。
- 高级用户可以通过 `--hook-command` 指定自定义命令，例如固定到某个绝对路径或使用包管理器 wrapper。

---

## 数据流图

```
┌─────────────────┐
│ Codex 记忆目录   │
│ ~/.codex/       │
│  memories/      │
└────────┬────────┘
         │
         │ memport sync（手动）
         │ 或
         │ SessionStart Hook → memport hook session-start（自动）
         │
         ▼
┌─────────────────┐
│   MemPort       │
│   核心逻辑       │
│  (src/core.ts)  │
└────────┬────────┘
         │
         │ 读取 + 复制
         │
         ▼
┌─────────────────────────────┐
│  项目 .claude/ 目录          │
│  ├─ CLAUDE.md               │
│  │   └─ # Codex Memories    │
│  ├─ settings.local.json     │
│  │   └─ SessionStart Hook   │
│  ├─ skills/                 │
│  │   └─ <skill-name>/       │
│  │       ├─ SKILL.md        │
│  │       └─ .memport.json   │
│  └─ codex-memories/         │
│      ├─ MEMORY.md           │
│      ├─ memory_summary.md   │
│      └─ *.md                │
└─────────────────────────────┘
         │
         │ Claude Code 读取项目指令、详细记忆文件和项目 skills
         │
         ▼
┌─────────────────┐
│ Claude Code     │
│ 会话上下文       │
└─────────────────┘
```

---

## 错误处理与边界情况

### 错误场景

| 场景 | 处理方式 |
|------|---------|
| Codex 目录不存在 | 显示错误提示，退出 |
| memory_summary.md 为空 | 提示并退出 |
| 无权限读取 Codex 目录 | 显示权限错误 |
| 无权限写入 .claude/ | 显示权限错误 |
| CLAUDE.md 缺少 MemPort marker | 安全追加新的托管区块到文件末尾 |
| CLAUDE.md marker 不成对 | 停止写入并提示用户修复 |
| .claude/skills/ 不存在 | 自动创建目录 |
| 目标 skill 已存在且非 MemPort 管理 | 不覆盖，提示用户处理冲突 |
| 用户级同名 skill 存在 | 同步项目 skill，但提示个人 skill 优先级更高，可能遮蔽项目 skill |
| 源 skill 缺少 SKILL.md | 跳过该目录并记录警告 |
| Hook 中 memport 命令不存在 | 记录可见提示，不阻塞会话启动 |
| Hook 同步超时 | 记录可见提示，不阻塞会话启动 |
| 磁盘空间不足 | 显示错误，回滚操作 |

### 数据完整性保障

**原子操作：**
```typescript
// 写入 CLAUDE.md 的安全模式
1. 写入临时文件：.claude/CLAUDE.md.tmp
2. 验证写入成功
3. 创建备份：.claude/CLAUDE.md.backup
4. 重命名临时文件为目标文件
5. 删除临时文件（如果存在）
```

```typescript
// 写入目录的安全模式
1. 创建本次同步 staging 目录：.claude/.memport-tmp/<run-id>/
2. 将 codex-memories/ 和 MemPort 管理的 skills 写入 staging
3. 校验文件数量、hash、SKILL.md 和 .memport.json
4. 对 MemPort 管理的目标目录执行 rename/swap
5. 清理 staging 目录；失败时保留原目标目录不变
```

**验证机制：**
- 复制后检查文件数量是否匹配
- 检查同步后的每个 skill 目录都包含 `SKILL.md`
- 检查 MemPort 管理的每个 skill 目录都包含有效 `.memport.json`
- 检查 CLAUDE.md 文件大小合理性
- 验证章节标记正确插入

**回滚机制：**
- 操作失败时恢复备份文件
- 操作失败时保留旧版 `.claude/codex-memories/` 和旧版 MemPort 管理的 skill 目录
- 清理临时文件和 staging 目录
- 记录详细错误日志

### 日志输出设计

**手动执行（详细模式）：**
```
$ memport sync

⏳ 正在同步 Codex 记忆...
   ✓ 读取 Codex 记忆摘要
   ✓ 复制 15 个记忆文件到 .claude/codex-memories/
   ✓ 同步 2 个 Codex skills 到 .claude/skills/
   ✓ 更新 .claude/CLAUDE.md（新增 Codex Memories 章节）
   ✅ 完成！Codex 记忆已同步到当前项目
```

**Hook 执行（静默模式）：**
```
$ memport hook session-start --project-root "$CLAUDE_PROJECT_DIR" --silent
```

成功时只输出 Claude Code Hook JSON；失败时输出包含 `systemMessage` 的 Hook JSON。

---

## 配置选项

MVP 不写入全局 `~/.claude/settings.json`，默认只写当前项目的 `.claude/settings.local.json` 来注册 Hook。可配置项通过 CLI 参数和环境变量提供：

| 配置 | CLI 参数 | 环境变量 | 默认值 |
|------|---------|----------|--------|
| Codex 记忆目录 | `--codex-path` | `MEMPORT_CODEX_PATH` | `~/.codex/memories` |
| 目标项目目录 | `--project-root` | `MEMPORT_PROJECT_ROOT` | 当前工作目录 |
| 是否更新 CLAUDE.md | `--no-claude-md` | 无 | 默认更新 |
| 是否更新 .gitignore | `--update-gitignore` | 无 | `init` 时询问 |
| 是否安装 Hook | `--install-hook` / `--no-install-hook` | 无 | `init` 时询问 |
| Hook 命令 | `--hook-command` | `MEMPORT_HOOK_COMMAND` | `memport hook session-start ...` |

---

## npm 包配置

### package.json

```json
{
  "name": "memport",
  "version": "1.0.0",
  "description": "Sync Codex memories to Claude Code projects",
  "main": "dist/index.js",
  "bin": {
    "memport": "./bin/memport"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "prepublishOnly": "npm run build"
  },
  "keywords": ["claude-code", "codex", "memory", "cli"],
  "author": "Your Name",
  "license": "MIT",
  "dependencies": {},
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

---

## 测试策略

### 单元测试

**核心功能测试：**
- `core.ts` 中的文件读取、复制、章节替换逻辑
- 边界情况：空文件、大文件、特殊字符
- 错误处理：权限问题、磁盘空间不足

**工具函数测试：**
- 章节边界识别正则表达式
- 文件路径处理
- CLI 参数与环境变量解析
- skill 目录识别、过滤、`.memport.json` 标记读写和冲突判断
- 用户级同名 skill 检测与提示逻辑

### 集成测试

**完整流程测试：**
1. 准备模拟的 Codex 记忆目录
2. 执行 `memport sync`
3. 验证生成的文件结构和内容
4. 验证 CLAUDE.md 章节正确插入
5. 验证 `~/.codex/memories/skills/<name>/` 同步到 `.claude/skills/<name>/`
6. 验证 MemPort 管理的目标 skill 写入有效 `.memport.json`
7. 验证同名非 MemPort 项目 skill 不会被覆盖
8. 验证用户级同名 skill 存在时会输出优先级遮蔽提示
9. 验证 `.claude/codex-memories/` 不再重复包含 `skills/`
10. 验证目录同步失败时旧版 `.claude/codex-memories/` 和旧版 MemPort 管理 skill 保持可用

**npm CLI 测试：**
1. 执行 `npm pack` 生成本地包
2. 在临时目录安装或通过 `npx --package` 执行
3. 验证 `memport init` 和 `memport sync` 都能找到正确的项目目录
4. 验证 `bin/memport` 可执行权限和 shebang 正确

**Hook 测试：**
1. 运行 `memport init --install-hook`
2. 验证 `.claude/settings.local.json` 中追加 SessionStart Hook，且不会覆盖已有 hooks
3. 执行 `claude --init-only` 验证 Setup 和 SessionStart Hook 能被触发
4. 验证 Hook 失败不会阻塞会话启动
5. 验证 Hook stdout 是合法 JSON，且包含 `hookSpecificOutput.hookEventName = "SessionStart"`
6. 验证 Hook 在写入或更新 skills 时返回 `hookSpecificOutput.reloadSkills = true`
7. 验证 Hook 触发后 `.claude/skills/` 也会刷新，并且本次会话首个 prompt 可以发现同步后的 skill

### 手动测试场景

**场景 1：首次安装**
```bash
1. 克隆项目到空目录
2. 运行 npm install -g memport 或 npx memport init
3. 运行 memport init
4. 验证 .claude/ 目录创建并完成一次同步
5. 选择安装 SessionStart Hook
6. 启动 Claude Code 会话，验证记忆自动刷新且可访问
```

**场景 2：npx 一次性执行**
```bash
1. 进入一个没有全局安装 memport 的项目
2. 运行 npx memport sync
3. 验证 .claude/ 目录和记忆文件生成
4. 验证不会写入 ~/.claude/settings.json
5. 验证若未全局安装 memport，`init` 会提示 Hook 需要稳定命令路径
```

**场景 3：手动同步**
```bash
1. 在 Codex 中更新记忆
2. 运行 memport sync
3. 验证 .claude/ 目录更新
4. 在 Claude Code 中验证新记忆可见
```

**场景 4：CLAUDE.md 已存在**
```bash
1. 创建包含自定义内容的 .claude/CLAUDE.md
2. 运行 memport sync
3. 验证自定义内容未被破坏
4. 验证 Codex Memories 章节正确插入
```

**场景 5：会话开始自动同步**
```bash
1. 运行 memport init --install-hook
2. 修改 ~/.codex/memories/memory_summary.md 的测试内容
3. 修改 ~/.codex/memories/skills/ 下的测试 skill
4. 运行 claude --init-only
5. 验证 .claude/CLAUDE.md、.claude/codex-memories/ 和 .claude/skills/ 已刷新
6. 验证 Hook 输出不会把普通日志污染进 Claude 上下文
```

**场景 6：已有项目 skill 冲突**
```bash
1. 在 .claude/skills/existing/SKILL.md 创建一个非 MemPort 管理的项目 skill
2. 在 ~/.codex/memories/skills/existing/SKILL.md 创建同名 Codex skill
3. 运行 memport sync
4. 验证项目 skill 未被覆盖
5. 验证命令输出明确提示同名冲突
```

**场景 6b：已有用户级同名 skill**
```bash
1. 在 ~/.claude/skills/existing/SKILL.md 创建个人 skill
2. 在 ~/.codex/memories/skills/existing/SKILL.md 创建同名 Codex skill
3. 运行 memport sync
4. 验证 .claude/skills/existing/ 被同步但命令输出提示个人 skill 优先级更高
5. 启动 Claude Code 后验证同名项目 skill 可能被个人 skill 遮蔽
```

**场景 7：Codex skill 支持文件**
```bash
1. 在 ~/.codex/memories/skills/demo/ 下创建 SKILL.md、scripts/、examples/
2. 运行 memport sync
3. 验证 .claude/skills/demo/ 保留完整支持文件结构
4. 验证 .claude/skills/demo/.memport.json 存在且 sourcePath/sourceHash 正确
5. 验证 .DS_Store、缓存目录和临时文件不会被复制
```

---

## 发布计划

### MVP 功能范围

**必须包含：**
- ✅ `memport init` 命令（初始化当前项目）
- ✅ `memport sync` 命令（手动同步）
- ✅ `memport hook session-start` 命令（SessionStart 自动同步入口）
- ✅ `.claude/settings.local.json` Hook 安装
- ✅ 三类同步（摘要 + 详细记忆 + skills）
- ✅ Codex skills 同步到 `.claude/skills/`
- ✅ CLAUDE.md 章节管理
- ✅ 基本错误处理
- ✅ npm 包发布配置

**后续版本：**
- v1.1: `memport status` 和 `memport uninstall` 命令
- v1.2: 增量同步优化、性能监控
- v1.3: Claude Code 插件市场分发
- v1.4: 记忆搜索工具（MCP tool）
- v2.0: 双向同步（Claude Code → Codex，需用户许可）

### 开发里程碑

| 阶段 | 任务 | 预计时间 |
|------|------|---------|
| 第 1 周 | 项目脚手架、核心同步逻辑（core.ts） | 3 天 |
| 第 1 周 | CLI 命令实现（init, sync, hook session-start） | 2 天 |
| 第 2 周 | skills 同步、冲突保护、settings.local.json Hook 安装与合并逻辑 | 3 天 |
| 第 2 周 | 错误处理、日志、测试 | 3 天 |
| 第 3 周 | npm package 配置、README 编写 | 2 天 |
| 第 3 周 | npm pack、本地安装、Hook 自动同步测试 | 3 天 |
| 第 4 周 | 发布准备、用户反馈收集 | 2 天 |

---

## 安全与隐私考虑

### 数据隐私
- 所有操作在本地进行，无网络传输
- 不上传记忆内容到任何服务器
- 用户应注意不将 `.claude/codex-memories/` 提交到公共仓库
- 用户应注意 `.claude/skills/` 中由 MemPort 同步的 skills 也可能包含项目历史、命令习惯或敏感路径
- 项目原生 `.claude/skills/` 可以是团队共享资产；不要为了隐藏 MemPort 同步内容而误忽略整个项目 skills 目录
- 用户应注意 `.claude/CLAUDE.md` 中的 MemPort 区块也可能包含敏感摘要

### 文件权限
- 仅读取用户的 Codex 记忆目录
- 仅写入当前项目的 `.claude/` 目录
- 不修改系统配置或其他用户文件

### 建议的 .gitignore
```gitignore
# MemPort 生成的文件（包含敏感信息）
.claude/codex-memories/
.claude/CLAUDE.md.backup

# 如果项目没有团队共享 skills，可忽略整个 skills 目录
# .claude/skills/

# 如果项目有团队共享 skills，只忽略由 MemPort 标记管理的目录需要用仓库自定义规则处理；
# 不建议默认忽略整个 .claude/skills/，以免误伤项目原生 skills。

# 保留本地 Hook 配置
.claude/settings.local.json

# 如果项目不希望提交 MemPort 摘要，可忽略整个 CLAUDE.md
# .claude/CLAUDE.md
```

---

## 成功指标

### 功能可靠性
- ✅ 同步成功率 > 99%
- ✅ 无数据丢失或损坏
- ✅ 错误信息清晰友好
- ✅ 不覆盖非 MemPort 管理的同名项目 skill

### 用户体验
- ✅ 安装过程 < 2 分钟
- ✅ 手动同步耗时 < 5 秒（常规项目）
- ✅ `npx memport sync` 能在未全局安装时完成同步
- ✅ SessionStart Hook 额外耗时 < 1 秒（常规项目）

### 回答质量
- ✅ Claude Code 能准确引用 Codex 记忆
- ✅ Claude Code 能在相关任务中发现并使用同步后的 Codex skills
- ✅ 用户反馈记忆信息有用且准确
- ✅ 减少用户重复提问的次数

---

## 未来扩展

### 短期改进（v1.x）
- 增量同步算法优化
- 记忆文件压缩（减少磁盘占用）
- 更丰富的配置选项（自定义路径、过滤规则）
- Claude Code 插件市场分发
- 全局 Hook 安装和跨项目策略

### 长期展望（v2.x）
- **双向同步**: 将 Claude Code 会话的关键决策写回 Codex（需谨慎处理冲突）
- **记忆查询工具**: 提供 MCP tool 让 Claude 更方便地搜索详细记忆
- **记忆分析**: 统计记忆使用频率，推荐清理过期内容
- **跨平台支持**: 支持其他 AI 编程工具的记忆格式

---

## 附录

### 参考资料

- [Codex 记忆机制文档](https://developers.openai.com/codex/memories)
- [npm package.json bin 字段文档](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#bin)
- [Claude Code Memory 文档](https://docs.anthropic.com/en/docs/claude-code/memory)
- [Claude Code Hooks 文档](https://docs.anthropic.com/en/docs/claude-code/hooks)
- [Claude Code Skills 文档](https://code.claude.com/docs/en/skills)

### 术语表

| 术语 | 定义 |
|------|------|
| Codex | OpenAI 的代码生成 AI 工具 |
| Claude Code | Anthropic 的代码辅助 CLI 工具 |
| 记忆（Memory） | AI 工具存储的用户偏好、项目知识等信息 |
| 摘要（Summary） | 精简的记忆内容，每次对话都加载 |
| 详细记忆 | 完整的记忆文件，按需查找 |
| npm CLI | 通过 npm 包分发并在命令行执行的工具 |
| npx | 无需全局安装即可执行 npm 包命令的方式 |
| Hook | Claude Code 的生命周期钩子，在特定事件触发 |
| SessionStart | Claude Code 会话开始、恢复、清空或 compact 后触发的 Hook |
