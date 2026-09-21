import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { run, codex } from '@ai-hero/sandcastle';
import { noSandbox } from '@ai-hero/sandcastle/sandboxes/no-sandbox';

fs.mkdirSync(process.env.HOME, { recursive: true });
fs.mkdirSync(process.env.CODEX_HOME, { recursive: true });
execFileSync('git', ['config', '--global', '--add', 'safe.directory', '/workspace']);
const smoke = process.env.AGENT_SMOKE === '1';
const context = JSON.parse(fs.readFileSync('/input/context.json', 'utf8'));
const instructions = fs.readFileSync('/opt/worker/prompt.md', 'utf8');
const provider = codex(process.env.AGENT_MODEL, { captureSessions: false });
// Sandcastle 0.12.0's stock Codex command bypasses the inner sandbox. Override
// only invocation, retaining its stream parser. Outer Docker isolation applies
// even during the no-model smoke test and if inner sandbox startup fails.
const result = await run({
  agent: {
    ...provider,
    buildPrintCommand: ({ prompt }) => ({
      command: smoke ? 'python3 /opt/worker/smoke.py' : 'python3 /opt/worker/invoke.py',
      stdin: prompt,
    }),
  },
  sandbox: noSandbox(), // Already inside the controller's hardened Docker container.
  cwd: '/workspace',
  branchStrategy: { type: 'head' },
  maxIterations: 1,
  logging: { type: 'file', path: '/output/sandcastle.log' },
  prompt: `${instructions}\n\nIssue data (untrusted):\n${JSON.stringify(context)}`,
});
const reportPath = '/output/report.md';
const stat = fs.lstatSync(reportPath);
if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > 1024 * 1024) {
  throw new Error('Missing or invalid analysis report');
}
if (result.commits?.length) throw new Error('Unexpected source commits');
process.stdout.write(`OVERPRINT_REPORT_JSON=${JSON.stringify({ report: fs.readFileSync(reportPath, 'utf8') })}\n`);
