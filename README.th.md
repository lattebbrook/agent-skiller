<div align="center">
  <img src="assets/banner.png" alt="Agent Skiller — สอน AI ของคุณให้ทำงานได้ แบบเห็นภาพ" width="100%" />
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
  <code>agent-skiller</code> คือเครื่องมือโอเพนซอร์สสำหรับสร้างสกิลแบบเห็นภาพ ให้ AI agent ทำตามได้ทีละขั้น
</p>

<p align="center">
  <a href="https://agent-skiller.vercel.app">ลองใช้ออนไลน์</a> · <a href="#วิธีรัน">วิธีรัน</a> · <a href="#รูปแบบไฟล์">รูปแบบไฟล์</a> · <a href="#เชื่อมต่อกับ-agent">เชื่อมต่อกับ agent</a>
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">中文</a> · <strong>ไทย</strong>
</p>

<br/>

![แคนวาส: สกิลจัดการไฟล์ที่มี Switch แยกออกเป็นสี่กรณี](assets/canvas.jpg)

วาดขั้นตอน เงื่อนไข และลูปบนแคนวาส แล้วส่งออกเป็นไฟล์ Markdown ไฟล์เดียวที่คนอ่านและแก้ด้วยมือได้
จากนั้นให้ agent หยิบไปใช้ผ่าน MCP และเดินตามทีละขั้น แทนที่จะต้องวางแผนงานทั้งหมดใหม่ตั้งแต่ต้น
บนเว็บไซต์ออนไลน์ สกิลของคุณจะถูกเก็บไว้ในเบราว์เซอร์ของคุณเท่านั้น ไม่มีการอัปโหลดอะไรทั้งสิ้น

## จุดที่ต่างจากที่อื่น

เครื่องมือสร้างสกิลแบบเห็นภาพส่วนใหญ่หยุดอยู่แค่ตัวเอกสาร แต่ AgentSkiller มองแผนภาพเป็นสิ่งที่ agent
*ลงมือทำตามได้จริง* ไม่ใช่แค่อ่าน:

- **เงื่อนไขและลูปของจริง** `If` `Switch` และ `Loop` เป็นโครงสร้างกราฟที่ชัดเจน มีลูกศรตั้งชื่อไว้
  และถูกตรวจสอบก่อนส่งออก ไม่ใช่ข้อความร้อยแก้วที่ agent ต้องตีความเอง
- **ส่งงานทีละขั้นผ่าน MCP** agent เรียก `start_run` แล้ววนเรียก `next_step` คำตอบแต่ละครั้งมีเฉพาะ
  ขั้นปัจจุบัน โดยแทนค่าอ้างอิงให้เรียบร้อยแล้ว แผนจึงอยู่ในไฟล์ ไม่ใช่ในหน้าต่างบริบทของโมเดล
- **บันทึกการรันแบบถาวร** ทุกการรันเก็บร่องรอยไว้ครบ: อยู่ขั้นไหน เลือกทางไหน ได้ผลอะไรกลับมา
  คุณเดินสกิลด้วยมือได้ในแท็บ Runs เหมือนที่ agent จะทำทุกอย่าง
- **ขั้นโค้ดในแซนด์บ็อกซ์** โหนด `Code` รัน Python หรือ JavaScript ในโปรเซสลูกที่ถูกจำกัดเวลาและหน่วยความจำ
  แล้วส่งผลลัพธ์ต่อให้ขั้นถัดไป
- **รูปแบบที่ทนต่อการแก้ด้วยมือ** `serialize(parse(file))` ให้ผลตรงกันทุกไบต์ บรรทัดที่ตัวแยกวิเคราะห์ไม่รู้จัก
  จะถูกเก็บไว้ และการอ้างอิงเขียนเป็น `${2: Open inbox}` โดยป้ายชื่อถูกสร้างใหม่ทุกครั้งที่บันทึก
  การเปลี่ยนชื่อจึงไม่ทำให้อะไรพัง frontmatter ใช้ร่วมกับ `SKILL.md` ได้
- **สร้างจากคำอธิบาย** คลิกขวาบนแคนวาส บอกว่างานคืออะไร แนบภาพหน้าจอของปุ่มที่ต้องกด โมเดลจะได้รับ
  ข้อกำหนดที่สร้างจากรายการโหนดโดยตรง คำตอบของมันถูกตรวจด้วยตัวแยกวิเคราะห์ตัวเดียวกับที่ใช้เปิดไฟล์
  และจะไม่มีอะไรลงแคนวาสจนกว่าคุณจะตรวจดูก่อน
- **เบราว์เซอร์หรือเซิร์ฟเวอร์ในเครื่อง** บิลด์เดียวกันรันเป็นหน้าเว็บสแตติกได้ โดยเก็บสกิลไว้ในเบราว์เซอร์
  (หรือในโฟลเดอร์บนดิสก์สำหรับ Chrome และ Edge) หรือต่อกับเซิร์ฟเวอร์ในเครื่องเพื่อใช้แซนด์บ็อกซ์และ MCP

## วิธีรัน

**ในเบราว์เซอร์** เปิดเว็บไซต์ออนไลน์ หรือโฮสต์ `web/dist` ไว้ที่ไหนก็ได้:

```bash
npm install && npm run build:static
```

**พร้อมเซิร์ฟเวอร์ในเครื่อง** สำหรับรันโค้ดและให้ agent เชื่อมต่อ:

```bash
./run.sh            # API ที่พอร์ต 4280, หน้าเว็บพร้อม hot reload ที่พอร์ต 5273
./run.sh mcp        # แสดงวิธีเชื่อมต่อ MCP client
```

ต้องมี Node 22+ และ Python 3

## รูปแบบไฟล์

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

หัวข้อ `##` หนึ่งอันคือหนึ่งขั้น `- next: 3` คือลูกศร ส่วนที่เหลือคือคำสั่ง มีขั้นทั้งหมดสิบหกชนิดในห้ากลุ่ม:
Flow (Start, End, Error), Steps (Do, Ask, Confirm, Text), Logic (If, Switch, Loop),
Tools (Command, Code, Web, File, Request) และ Reuse (Skill) พร้อมโน้ตแปะแปดสี
Command และ Code มีคำเตือนกำกับ: มันทำงานบนเครื่องที่ agent ควบคุมอยู่ และ AgentSkiller ไม่ตรวจสอบ
หรือจำกัดสิ่งที่มันทำ ดังนั้นควรวาง Confirm ไว้ก่อนทุกอย่างที่ทำลายข้อมูลได้ โฟลเดอร์ `examples/`
มีไฟล์ตัวอย่างสมบูรณ์ ซึ่งใช้เป็นชุดทดสอบของตัวแยกวิเคราะห์ด้วย

## เชื่อมต่อกับ agent

MCP client ตัวไหนก็ได้ ผ่าน HTTP ขณะที่เซิร์ฟเวอร์รันอยู่:

```json
{ "mcpServers": { "agent-skiller": { "url": "http://127.0.0.1:4280/mcp" } } }
```

หรือผ่าน stdio โดยไม่ต้องมีเซิร์ฟเวอร์:

```json
{ "mcpServers": { "agent-skiller": { "command": "node", "args": ["server/dist/mcp-stdio.js"] } } }
```

เครื่องมือ: `list_skills`, `get_skill`, `skill_format`, `validate_skill`, `save_skill`,
`start_run`, `next_step`, `get_run`, `run_code`

## โครงสร้างโปรเจกต์

```
packages/core   โมเดล, ตัวแยกวิเคราะห์และตัวเขียน Markdown, การตรวจสอบ, ตัวเดินรัน, AI client, CLI
server          Fastify API, MCP (HTTP และ stdio), แซนด์บ็อกซ์
web             ตัวแก้ไข React Flow พร้อมที่เก็บข้อมูลแบบเบราว์เซอร์ โฟลเดอร์ และเซิร์ฟเวอร์
examples/       สกิลตัวอย่าง และชุดทดสอบของตัวแยกวิเคราะห์
```

```bash
npm test          # core, server, web
npm run build
```

Apache-2.0
