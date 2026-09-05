---
name: file-triage
description: Sort a downloaded file into the right folder by its type, asking when unsure.
tags: [files, computer-use]
version: 1
format: agent-skiller/1
---

# File triage

A small decision tree that shows Switch and Ask working together.

## 1. Start
- when: a new file appears in the Downloads folder
- input: the path of the new file
- next: 2

## 2. Do: Inspect the file
Open Finder at ${input}. Note the file name, extension and size.
- next: 3

## 3. Switch: What is the file extension?
Use the extension from ${2: Inspect the file}.
- case pdf: 4
- case png: 5
- case zip: 6
- default: 7

## 4. Do: File the PDF
Move the file to Documents/PDFs.
- next: 9

## 5. Do: File the image
Move the file to Pictures/Downloads.
- next: 9

## 6. Do: Unpack the archive
### 6.1 Extract
Double-click the archive so Finder extracts it next to the file.
### 6.2 Clean up
Move the extracted folder to Documents/Archives and delete the .zip.
- next: 9

## 7. Ask: Where should this go?
I found ${2.name: Inspect the file} but do not know where it belongs. Documents, Pictures, or leave it?
- next: 8

## 8. Do: Move as asked
Move the file to the folder the user chose in ${7: Where should this go?}, unless they said to leave it.
- next: 9

## 9. End: Done
Tell the user where the file ended up.

> Note: Switch cases are matched case-insensitively by the walker.

<!-- agent-skiller:layout {"1":[0,120],"2":[260,120],"3":[520,120],"4":[800,0],"5":[800,100],"6":[800,200],"7":[800,340],"8":[1080,340],"9":[1340,200],"n1":[520,260]} -->
