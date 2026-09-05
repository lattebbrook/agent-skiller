<div align="center">
  <img src="assets/banner.png" alt="Agent Skiller — Teach your AI how to work, visually." width="100%" />
</div>

<br/>

<h1 align="center"><code>agent-skiller</code></h1>

<div align="center">

<img src="https://img.shields.io/badge/mission-teach_your_AI_how_to_work-8b1e8f" alt="mission: teach your AI how to work" />
<img src="https://img.shields.io/github/languages/top/lattebbrook/agent-skiller?color=3178c6" alt="TypeScript" />
<img src="https://img.shields.io/github/last-commit/lattebbrook/agent-skiller?label=last%20commit&color=2ea45c" alt="last commit" />
<img src="https://img.shields.io/badge/License-Apache--2.0-2ea45c" alt="License Apache-2.0" />
<a href="https://agent-skiller.vercel.app"><img src="https://img.shields.io/badge/Live-agent--skiller.vercel.app-0060f5?logo=vercel&logoColor=white" alt="Live" /></a>
<img src="https://img.shields.io/badge/MCP-HTTP_%2B_stdio-8b5cf6" alt="MCP" />

</div>

<p align="center">
  <code>agent-skiller</code> is an open-source visual builder for skills an AI agent can follow, step by step.
</p>

<p align="center">
  <a href="https://agent-skiller.vercel.app">Try it live</a> · <a href="#run-it">Run it</a> · <a href="#the-format">The format</a> · <a href="#connect-an-agent">Connect an agent</a>
</p>

<br/>

![The canvas: a file-triage skill with a Switch branching into four cases](assets/canvas.jpg)

Draw the steps, branches and loops on a canvas; export one Markdown file a person can read
and edit by hand; let an agent pick it up over MCP and walk it one step at a time instead of
planning the whole job from scratch. Skills stay in your browser on the live site; nothing is
uploaded.

## What makes it different

Most visual skill builders stop at the document. AgentSkiller treats the graph as something
an agent can *execute*, not just read:

- **Real branches and loops.** `If`, `Switch` and `Loop` are explicit graph semantics with
  named arrows, validated before export, not prose the agent has to interpret.
- **Step-by-step delivery over MCP.** An agent calls `start_run`, then loops on `next_step`.
  Each answer carries only the current step, with references already substituted, so the
  plan lives in the file rather than in the model's context window.
- **Persistent runs.** Every run keeps its trace: which step, which branch, what came back.
  You can walk a skill by hand in the Runs tab exactly the way an agent would.
- **Sandboxed code steps.** A `Code` node runs Python or JavaScript in a locked-down
  subprocess with time and memory limits, and hands the result to the next step.
- **A format that survives hand edits.** `serialize(parse(file))` is byte-identical, lines the
  parser does not understand are kept, and references read as `${2: Open inbox}` with the
  label regenerated on every save so renaming never breaks anything. The frontmatter is
  `SKILL.md` compatible.
- **Generate from a description.** Right-click the canvas, say what the job is, attach a
  screenshot of the buttons to press. The model gets a spec generated from the node catalogue,
  its answer is validated by the same parser that opens a file, and nothing lands until you
  review it.
- **Browser or local server.** The same build runs as a static page with skills kept in your
  browser (or in a folder on your disk in Chrome and Edge), or against a local server for the
  sandbox and MCP.

## Run it

**In the browser.** Open the live site, or host `web/dist` anywhere:

```bash
npm install && npm run build:static
```

**With the local server**, for code execution and agents:

```bash
./run.sh            # API on 4280, UI with hot reload on 5273
./run.sh mcp        # prints how to connect an MCP client
```

Requires Node 22+ and Python 3.

## The format

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

A `##` heading is a step, `- next: 3` is an arrow, everything else is the instruction. Sixteen
kinds of step in five groups: Flow (Start, End, Error), Steps (Do, Ask, Confirm, Text), Logic
(If, Switch, Loop), Tools (Command, Code, Web, File, Request) and Reuse (Skill), plus sticky
notes in eight colours. Command and Code carry a caution: they act on the machine the agent
controls, and AgentSkiller does not check or limit what they do, so put a Confirm before
anything destructive. `examples/` has complete files; they double as parser fixtures.

## Connect an agent

Any MCP client. Over HTTP while the server runs:

```json
{ "mcpServers": { "agent-skiller": { "url": "http://127.0.0.1:4280/mcp" } } }
```

Or over stdio, with no server:

```json
{ "mcpServers": { "agent-skiller": { "command": "node", "args": ["server/dist/mcp-stdio.js"] } } }
```

Tools: `list_skills`, `get_skill`, `skill_format`, `validate_skill`, `save_skill`,
`start_run`, `next_step`, `get_run`, `run_code`.

## Layout

```
packages/core   model, Markdown parser/serializer, validation, run walker, AI client, CLI
server          Fastify API, MCP (HTTP and stdio), sandbox
web             React Flow editor with browser, folder and server storage backends
examples/       sample skills and parser fixtures
```

```bash
npm test          # core, server, web
npm run build
```

Apache-2.0.
