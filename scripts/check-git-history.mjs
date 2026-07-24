import { execFileSync } from 'node:child_process';

const patterns = [
  ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{20,}/g],
  ['Google OAuth client secret', /GOCSPX-[A-Za-z0-9_-]{20,}/g],
  ['Google OAuth refresh token', /1\/\/[A-Za-z0-9_-]{30,}/g],
  ['Private key block', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
];

const history = execFileSync(
  'git',
  [
    'log',
    '--all',
    '-p',
    '--format=',
    '--',
    '.',
    ':(exclude)scripts/check-git-history.mjs',
    ':(exclude)scripts/check-sale-readiness.mjs',
  ],
  { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 },
);

const findings = patterns
  .map(([label, pattern]) => [label, history.match(pattern)?.length ?? 0])
  .filter(([, count]) => count > 0);

if (findings.length) {
  console.error('Potential historical secrets detected (values are intentionally hidden):');
  for (const [label, count] of findings) console.error(`- ${label}: ${count} occurrence(s)`);
  console.error('Deliver a clean git-archive snapshot or rewrite history after every affected credential is rotated.');
  process.exit(1);
}

console.log('No recognized secret formats were found in Git patch history.');
