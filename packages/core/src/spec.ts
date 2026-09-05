/**
 * The format, written out for a reader that is not a person: a model asked to
 * author a skill, or an agent using save_skill. It is generated from the node
 * catalogue, so it cannot drift from what the parser accepts.
 */
import { SKILL_FORMAT } from './model.js';
import { NODE_GROUPS, NODE_META, PALETTE, TEXT_CHECK_RULE } from './nodeTypes.js';

export function formatGuide(): string {
  const kinds = NODE_GROUPS.map((group) => {
    const rows = PALETTE.filter((entry) => entry.group === group.id).map((entry) => {
      const meta = NODE_META[entry.type];
      const outs = meta.outputs.map((handle) => `- ${handle.id}: <id>`).join('  ');
      const settings = meta.fields.filter((field) => !(meta.fence && (field.key === 'language' || field.key === 'shell')) && !field.locked).map((field) => `- ${field.key}: …`).join('  ');
      const arrows = entry.type === 'switch' ? '- case <label>: <id>  - default: <id>' : outs || '(none: this node ends the skill)';
      const body = !meta.hasBody ? 'none' : meta.fence ? `a \`\`\`${meta.fence} fenced block` : meta.bodyLabel.toLowerCase();
      return `- **${meta.keyword}** — ${meta.description}
  Heading: \`## <id>. ${meta.keyword}: ${meta.namePlaceholder}\`
  Arrows: ${arrows}${settings ? `\n  Settings: ${settings}` : ''}
  Body: ${body}`;
    });
    return `${group.label}: ${group.description}\n${rows.join('\n')}`;
  }).join('\n\n');

  return `You are writing an AgentSkiller skill: one Markdown file that an AI agent reads and
follows step by step. Write it so a person can read it too. Rules:

1. Frontmatter first, exactly these keys:
   ---
   name: kebab-case-name
   description: one line saying when an agent should use this skill
   tags: [two, or, three]
   version: 1
   format: ${SKILL_FORMAT}
   ---
2. Then \`# Title\`, then an optional paragraph saying when to use the skill.
3. Every step is a heading \`## <number>. <Kind>: <sentence>\`. Numbers start at 1,
   are unique, and never change meaning. The sentence is the step's name.
4. Under a heading: \`- key: value\` lines for settings and arrows, and everything
   else is the instruction the agent follows. Write instructions as plain
   imperative sentences, the way you would tell a careful colleague.
5. Arrows are \`- next: 3\`, \`- yes: 4\`, \`- no: 5\`, \`- case pdf: 6\`,
   \`- default: 7\`, \`- fail: 8\`. Every branch must lead somewhere or end at an
   End node. Arrows only ever point forward; never point back at an earlier step.
6. To use the result of an earlier step, write \`\${2: Name of step 2}\`. Use
   \`\${input}\` for what the caller passed to Start.
7. Exactly one Start node, id 1. Every path finishes at an End node, or at an
   Error node when something went wrong.
8. Optional: \`### 2.1 Stage name\` splits a long step into sub-steps, and
   \`> Note (on 3): …\` leaves a note for the human reader.

The kinds of step, and nothing else:
${kinds}

A Code node holds a fenced \`\`\`python or \`\`\`javascript block. The script reads
\`{"input": …, "steps": {"2": …}}\` from stdin and prints its result. Standard
library only, no network, 10 seconds. A Command node holds a fenced \`\`\`sh block
the agent runs in its own terminal. Every Text node carries the fixed line
\`- check: ${TEXT_CHECK_RULE}\`; write it as shown. Put a Confirm node before any
Command or File step that deletes, overwrites or sends something.

Do not invent settings, node kinds or arrow names that are not listed above.
Prefer plain Do steps: the agent is capable, and the skill exists to save it
from having to plan. Reach for Code only for real computation.

Reply with the Markdown file and nothing else. No commentary, no code fence
around the whole document.`;
}

/** A short, complete example, useful as a second message to a model. */
export const EXAMPLE_SKILL = `---
name: file-to-folder
description: Put a downloaded file in the right folder, asking when unsure.
tags: [files]
version: 1
format: ${SKILL_FORMAT}
---

# File to folder

## 1. Start
- when: a file finishes downloading
- input: the path of the file
- next: 2

## 2. Do: Look at the file
Open Finder at \${input}. Note the name and extension.
- next: 3

## 3. If: Is it a PDF?
Check the extension from \${2: Look at the file}.
- yes: 4
- no: 5

## 4. Do: File the PDF
Move it to Documents/PDFs.
- next: 6

## 5. Ask: Where should this go?
I do not know where \${2: Look at the file} belongs. Which folder?
- next: 6

## 6. End: Done
Tell the user where the file ended up.
`;
