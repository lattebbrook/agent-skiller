---
name: release-checklist
description: Tag a release, build it, and post the notes, with a confirmation before anything is pushed.
tags: [devops, terminal]
version: 1
format: agent-skiller/1
---

# Release checklist

Shows the tool nodes together: a File read, a Text the agent must check, a Confirm gate, and Commands.

## 1. Start
- when: cut a release
- input: the version, e.g. 1.4.0
- next: 2

## 2. File: Read the changelog
- path: CHANGELOG.md
Read the section for ${input} and note every bullet under it.
- next: 3

## 3. Text: Release notes
- check: check the format and correctness of this text before continuing
Release ${input}

${2: Read the changelog}

Thanks to everyone who reported issues.
- next: 4

## 4. Confirm: Tag and push ${input}?
This will create tag v${input} on the current commit and push it to origin. The notes will read as in ${3: Release notes}. Proceed?
- yes: 5
- no: 7

> Note (on 4, orange): Commands run on the agent's machine. The Confirm before them is the safety net.

## 5. Command: Tag and push
```sh
git tag -a "v${input}" -m "Release ${input}"
git push origin "v${input}"
```
- next: 6
- fail: 8

## 6. End: Released
Tell the user the tag was pushed and paste the notes from ${3: Release notes}.

## 7. End: Cancelled
Tell the user nothing was tagged or pushed.

## 8. Error: Push failed
The tag or push failed. Show the command output and do not retry on your own.

<!-- agent-skiller:layout {"1":[0,80],"2":[260,80],"3":[520,80],"4":[780,80],"5":[1040,0],"6":[1300,0],"7":[1040,180],"8":[1300,100],"n1":[780,200]} -->
