import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'LICENSE',
  'SECURITY.md',
  'CHANGELOG.md',
  'Dockerfile',
  '.env.example',
  'docs/SALE_HANDOFF.md',
  'docs/DEPLOYMENT.md',
  'docs/NETWORKING.md',
  'docs/GOOGLE_AUTH.md',
  'docs/LEGAL_CHECKLIST.md',
];

const missing = requiredFiles.filter((file) => !existsSync(file));
if (missing.length) {
  console.error(`Missing sale artifacts: ${missing.join(', ')}`);
  process.exit(1);
}

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const repositoryFiles = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean);
const forbiddenTracked = tracked.filter((file) =>
  /(^|\/)\.env($|\.)/.test(file) && !file.endsWith('.env.example'),
);
if (forbiddenTracked.length) {
  console.error(`Environment files must not be tracked: ${forbiddenTracked.join(', ')}`);
  process.exit(1);
}

const secretPatterns = [
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /GOCSPX-[A-Za-z0-9_-]{20,}/,
  /1\/\/[A-Za-z0-9_-]{30,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const excluded = new Set(['scripts/check-sale-readiness.mjs', 'package-lock.json']);
const suspicious = repositoryFiles.filter((file) => {
  if (excluded.has(file) || !existsSync(file)) return false;
  try {
    const contents = readFileSync(file, 'utf8');
    return secretPatterns.some((pattern) => pattern.test(contents));
  } catch {
    return false;
  }
});
if (suspicious.length) {
  console.error(`Potential secrets found in repository files: ${suspicious.join(', ')}`);
  process.exit(1);
}

console.log('Sale-readiness repository checks passed.');
