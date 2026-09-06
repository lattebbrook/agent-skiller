/**
 * The example skills, bundled into the static build so a fresh browser
 * workspace never opens empty, and so any workspace — a linked folder, the
 * server — can ask for them later from Settings. Vite inlines them as strings.
 */
import summarizeInbox from '../../../examples/summarize-inbox.md?raw';
import fileTriage from '../../../examples/file-triage.md?raw';
import plainChecklist from '../../../examples/plain-checklist.md?raw';
import releaseChecklist from '../../../examples/release-checklist.md?raw';

export const EXAMPLE_FILES: { path: string; markdown: string }[] = [
  { path: 'Example/summarize-inbox.md', markdown: summarizeInbox },
  { path: 'Example/file-triage.md', markdown: fileTriage },
  { path: 'Example/plain-checklist.md', markdown: plainChecklist },
  { path: 'Example/release-checklist.md', markdown: releaseChecklist },
];

/** What a brand new browser workspace starts with. */
export const SEED_FILES = EXAMPLE_FILES;
