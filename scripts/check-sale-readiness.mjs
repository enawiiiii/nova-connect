import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'SECURITY.md',
  'CHANGELOG.md',
  'Dockerfile',
  '.env.example',
  'apps/api/.env.example',
  'apps/web/.env.example',
  'docs/SALE_HANDOFF.md',
  'docs/BUYER_ACCEPTANCE.md',
  'docs/BACKUP_RESTORE.md',
  'docs/REBRANDING.md',
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
  /xkeysib-[A-Za-z0-9_-]{20,}/,
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

const personalMarkers = [
  /AHMADMOM247@GMAIL\.COM/i,
  /novaconnect\.verify@gmail\.com/i,
  /connextnova@gmail\.com/i,
];
const personalized = repositoryFiles.filter((file) => {
  if (excluded.has(file) || !existsSync(file)) return false;
  try {
    const contents = readFileSync(file, 'utf8');
    return personalMarkers.some((pattern) => pattern.test(contents));
  } catch {
    return false;
  }
});
if (personalized.length) {
  console.error(`Seller-specific identities found in repository files: ${personalized.join(', ')}`);
  process.exit(1);
}

const renderBlueprint = readFileSync('render.yaml', 'utf8');
for (const transferableKey of ['REFRESH_TOKEN_DAYS', 'MAIL_TRANSPORT', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) {
  const block = new RegExp(`- key: ${transferableKey}\\r?\\n([\\s\\S]*?)(?=\\r?\\n\\s+- key:|$)`).exec(renderBlueprint)?.[1] ?? '';
  if (!/sync:\s*false/.test(block)) {
    console.error(`${transferableKey} must be supplied by the buyer in render.yaml`);
    process.exit(1);
  }
}

console.log('Sale-readiness repository checks passed.');
