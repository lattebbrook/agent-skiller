<div align="center">
  <img src="assets/banner.png" alt="Agent Skiller — 用可视化的方式教 AI 如何工作" width="100%" />
</div>

<br/>

<h1 align="center"><code>agent-skiller</code></h1>

---

<div align="center">

<img src="https://img.shields.io/badge/mission-teach_your_AI_how_to_work-8b1e8f" alt="mission: teach your AI how to work" />
<img src="https://img.shields.io/github/languages/top/lattebbrook/agent-skiller?color=3178c6" alt="TypeScript" />
<img src="https://img.shields.io/github/last-commit/lattebbrook/agent-skiller?label=last%20commit&color=2ea45c" alt="last commit" />
<img src="https://img.shields.io/badge/License-Apache--2.0-2ea45c" alt="License Apache-2.0" />
<a href="https://agent-skiller.vercel.app"><img src="https://img.shields.io/badge/Live-agent--skiller.vercel.app-0060f5?logo=vercel&logoColor=white" alt="Live" /></a>
<img src="https://img.shields.io/badge/MCP-HTTP_%2B_stdio-8b5cf6" alt="MCP" />

</div>

<p align="center">
  <code>agent-skiller</code> 是一个开源的可视化技能构建器，用来编写 AI 智能体能够一步一步执行的技能。
</p>

<p align="center">
  <a href="https://agent-skiller.vercel.app">在线试用</a> · <a href="#运行">运行</a> · <a href="#文件格式">文件格式</a> · <a href="#连接智能体">连接智能体</a>
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>中文</strong> · <a href="README.th.md">ไทย</a>
</p>

<br/>

![画布：一个文件分类技能，Switch 节点分出四个分支](assets/canvas.jpg)

在画布上画出步骤、分支和循环；导出一个人类可以直接阅读和手动编辑的 Markdown 文件；让智能体通过
MCP 读取它，一步一步地执行，而不是每次都从零开始规划整个任务。在线版本的技能只保存在你的浏览器里，
不会上传任何内容。

## 有什么不同

大多数可视化技能构建器止步于生成文档。AgentSkiller 把流程图当作智能体可以*执行*的东西，而不只是阅读：

- **真正的分支和循环。** `If`、`Switch` 和 `Loop` 是带有命名箭头的明确图结构，导出前会经过校验，
  而不是需要智能体自行理解的散文。
- **通过 MCP 逐步交付。** 智能体调用 `start_run`，然后循环调用 `next_step`。每次返回只包含当前这一步，
  引用已经替换完成，所以计划存在文件里，而不是占用模型的上下文窗口。
- **持久化的运行记录。** 每次运行都保留完整轨迹：走到哪一步、选了哪个分支、得到了什么结果。
  你可以在 Runs 标签页里像智能体一样手动走完一个技能。
- **沙箱中的代码步骤。** `Code` 节点在受限的子进程中运行 Python 或 JavaScript，有时间和内存限制，
  并把结果交给下一步。
- **经得起手动编辑的格式。** `serialize(parse(file))` 逐字节一致，解析器不认识的行会被保留，
  引用写作 `${2: Open inbox}`，标签在每次保存时重新生成，所以重命名不会破坏任何东西。
  frontmatter 与 `SKILL.md` 兼容。
- **从一句描述生成。** 在画布上右键，说明要做什么，附上要点击的按钮的截图。模型会拿到一份由节点目录
  自动生成的规范，它的回答会经过打开文件所用的同一个解析器校验，在你审阅之前不会写入任何内容。
- **浏览器或本地服务器。** 同一份构建既可以作为静态页面运行，技能保存在浏览器里（在 Chrome 和 Edge
  中也可以保存到磁盘上的文件夹），也可以连接本地服务器以使用沙箱和 MCP。

## 运行

**在浏览器中。** 打开在线站点，或把 `web/dist` 托管到任何地方：

```bash
npm install && npm run build:static
```

**使用本地服务器**，以便执行代码和连接智能体：

```bash
./run.sh            # API 在 4280 端口，带热重载的界面在 5273 端口
./run.sh mcp        # 打印如何连接 MCP 客户端
```

需要 Node 22+ 和 Python 3。

## 文件格式

```markdown
---
name: summarize-inbox
description: Read unread mail and report a five-line summary.
format: agent-skiller/1
---

# Summarize inbox

## 1. Start
- when: summarize my inbox
- next: 2

## 2. Do: Open inbox
Open the Mail app and select the Inbox folder.
- next: 3

## 3. If: Any unread messages?
Look at the message list from ${2: Open inbox}.
- yes: 4
- no: 5

## 4. Loop: For each unread message in ${2: Open inbox}
Open it. Note the sender, subject and the first two sentences.
- next: 6

## 5. End: Nothing new
Tell the user there are no unread messages.

## 6. End: Report
Tell the user, in at most five lines, what is new.
```

一个 `##` 标题就是一个步骤，`- next: 3` 是一条箭头，其余内容都是指令。共有十六种步骤，分为五组：
流程（Start、End、Error）、步骤（Do、Ask、Confirm、Text）、逻辑（If、Switch、Loop）、
工具（Command、Code、Web、File、Request）和复用（Skill），另外还有八种颜色的便签。
Command 和 Code 带有警示：它们作用于智能体所控制的机器，AgentSkiller 不会检查或限制它们的行为，
所以请在任何破坏性操作之前放一个 Confirm。`examples/` 目录中有完整的示例文件，它们同时也是解析器的测试用例。

## 连接智能体

任何 MCP 客户端都可以。服务器运行时通过 HTTP：

```json
{ "mcpServers": { "agent-skiller": { "url": "http://127.0.0.1:4280/mcp" } } }
```

或者通过 stdio，无需服务器：

```json
{ "mcpServers": { "agent-skiller": { "command": "node", "args": ["server/dist/mcp-stdio.js"] } } }
```

工具：`list_skills`、`get_skill`、`skill_format`、`validate_skill`、`save_skill`、
`start_run`、`next_step`、`get_run`、`run_code`。

## 目录结构

```
packages/core   数据模型、Markdown 解析与序列化、校验、运行步进器、AI 客户端、命令行工具
server          Fastify API、MCP（HTTP 与 stdio）、沙箱
web             React Flow 编辑器，支持浏览器、文件夹和服务器三种存储后端
examples/       示例技能，同时作为解析器的测试用例
```

```bash
npm test          # core、server、web
npm run build
```

Apache-2.0。
