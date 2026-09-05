#!/usr/bin/env node
/**
 * skiller fmt <files…>       rewrite Markdown skills in canonical form (--check to only verify)
 * skiller validate <files…>  report problems
 * skiller json <file>        print the JSON form
 * skiller md <file.json>     print the Markdown form
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { importText } from './importer.js';
import { serializeMarkdown } from './markdown.js';
import { toJson } from './json.js';
import { validateSkill } from './validate.js';

const [command, ...args] = process.argv.slice(2);
const check = args.includes('--check');
const files = args.filter((arg) => !arg.startsWith('--'));

function load(file: string) {
  return importText(readFileSync(file, 'utf8'), file);
}

let failed = false;
switch (command) {
  case 'fmt':
    for (const file of files) {
      const { skill, diagnostics } = load(file);
      const canonical = serializeMarkdown(skill);
      const original = readFileSync(file, 'utf8');
      for (const diagnostic of diagnostics) console.error(`${file}: ${diagnostic.severity}: ${diagnostic.message}`);
      if (canonical === original) continue;
      if (check) {
        console.error(`${file}: not canonical`);
        failed = true;
      } else {
        writeFileSync(file, canonical);
        console.log(`${file}: rewritten`);
      }
    }
    break;
  case 'validate':
    for (const file of files) {
      const { skill, diagnostics } = load(file);
      const problems = validateSkill(skill);
      for (const diagnostic of diagnostics) console.log(`${file}: ${diagnostic.severity}: ${diagnostic.message}`);
      for (const problem of problems) console.log(`${file}: ${problem.severity}${problem.nodeId ? ` (node ${problem.nodeId})` : ''}: ${problem.message}`);
      if (problems.some((problem) => problem.severity === 'error')) failed = true;
      if (problems.length === 0 && diagnostics.length === 0) console.log(`${file}: ok`);
    }
    break;
  case 'json':
    for (const file of files) process.stdout.write(toJson(load(file).skill));
    break;
  case 'md':
    for (const file of files) process.stdout.write(serializeMarkdown(load(file).skill));
    break;
  default:
    console.error('usage: skiller <fmt [--check]|validate|json|md> <files…>');
    failed = true;
}
process.exit(failed ? 1 : 0);
