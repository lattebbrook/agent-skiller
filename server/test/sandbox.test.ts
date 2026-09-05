import { describe, expect, it } from 'vitest';
import { runCode } from '../src/sandbox/run.js';

describe('sandbox', () => {
  it('runs python with JSON on stdin and parses JSON stdout', async () => {
    const result = await runCode({ language: 'python', code: 'import json,sys\nd=json.load(sys.stdin)\nprint(json.dumps({"double": d["n"]*2}))', input: { n: 21 } });
    expect(result.exitStatus).toBe(0);
    expect(result.output).toEqual({ double: 42 });
    expect(result.timedOut).toBe(false);
  });

  it('reports python errors with a non-zero exit', async () => {
    const result = await runCode({ language: 'python', code: 'raise SystemExit(3)', input: null });
    expect(result.exitStatus).toBe(3);
  });

  it('captures stderr for exceptions', async () => {
    const result = await runCode({ language: 'python', code: 'x = 1/0', input: null });
    expect(result.exitStatus).not.toBe(0);
    expect(result.stderr).toContain('ZeroDivisionError');
  });

  it('kills scripts that exceed the timeout', async () => {
    const result = await runCode({ language: 'python', code: 'import time\ntime.sleep(30)', input: null, timeoutSeconds: 1 });
    expect(result.timedOut).toBe(true);
    expect(result.durationMs).toBeLessThan(5000);
  });

  it('does not leak the server environment', async () => {
    process.env['SKILLER_SECRET_FOR_TEST'] = 'leak';
    const result = await runCode({ language: 'python', code: 'import os\nprint(os.environ.get("SKILLER_SECRET_FOR_TEST","none"))', input: null });
    expect(result.output).toBe('none');
  });

  it('runs javascript as the fallback', async () => {
    const result = await runCode({ language: 'javascript', code: 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(JSON.stringify(d.a+1))', input: { a: 1 } });
    expect(result.exitStatus).toBe(0);
    expect(result.output).toBe(2);
  });
});
