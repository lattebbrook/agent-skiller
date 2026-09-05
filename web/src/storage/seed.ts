/**
 * The example skills, bundled into the static build so a fresh browser
 * workspace never opens empty. Vite inlines them as strings.
 */
import summarizeInbox from '../../../examples/summarize-inbox.md?raw';
import fileTriage from '../../../examples/file-triage.md?raw';
import plainChecklist from '../../../examples/plain-checklist.md?raw';

export const SEED_FILES: { path: string; markdown: string }[] = [
  { path: 'examples/summarize-inbox.md', markdown: summarizeInbox },
  { path: 'examples/file-triage.md', markdown: fileTriage },
  { path: 'examples/plain-checklist.md', markdown: plainChecklist },
];
