---
name: summarize-inbox
description: Open the mail app, read unread messages and report a five-line summary.
tags: [mail, summary]
version: 1
format: agent-skiller/1
---

# Summarize inbox

Use this when the user wants to know what is new in their mailbox without opening it.

## 1. Start
- when: summarize my inbox
- when: what's new in mail
- next: 2

## 2. Do: Open inbox
Open the Mail app. Click the **Inbox** folder in the left sidebar and wait until the
message list has finished loading.
- next: 3

## 3. If: Any unread messages?
Look at the message list from ${2: Open inbox}. Unread messages are bold or have a blue dot.
- yes: 4
- no: 7

> Note (on 3): Some clients show unread as a blue dot rather than bold text.

## 4. Loop: For each unread message in ${2: Open inbox}
Open the message. Note the sender, subject and the first two sentences, then go back
to the list.
- next: 5

## 5. Code: Rank by sender
```python
import json, sys
data = json.load(sys.stdin)
notes = data["steps"].get("4", [])
print(json.dumps(sorted(notes, key=lambda m: m["sender"]) if isinstance(notes, list) else notes))
```
- next: 6
- fail: 8

## 6. End: Report
Tell the user, in at most five lines, what is new. Use ${5: Rank by sender}.

## 7. End: Nothing new
Tell the user there are no unread messages.

## 8. Error: Ranking failed
Ranking the messages failed. Report the messages from ${4} unranked and say so.

<!-- agent-skiller:layout {"1":[0,0],"2":[260,0],"3":[520,0],"4":[780,-90],"5":[1040,-90],"6":[1300,-90],"7":[780,120],"8":[1300,60],"n1":[520,90]} -->
