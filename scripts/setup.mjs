import crypto from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const targets = [
  {
    source: 'apps/api/.env.example',
    destination: 'apps/api/.env',
    prepare(contents) {
      return contents
        .replace('replace-with-at-least-32-random-characters', crypto.randomBytes(48).toString('base64url'))
        .replace('replace-with-another-32-random-characters', crypto.randomBytes(48).toString('base64url'));
    },
  },
  {
    source: 'apps/web/.env.example',
    destination: 'apps/web/.env.local',
    prepare: (contents) => contents,
  },
];

let created = 0;
for (const target of targets) {
  if (existsSync(target.destination)) {
    console.log(`Kept existing ${target.destination}`);
    continue;
  }
  const template = readFileSync(target.source, 'utf8');
  writeFileSync(target.destination, target.prepare(template), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  console.log(`Created ${target.destination}`);
  created += 1;
}

console.log(created
  ? 'Local configuration is ready. Review provider placeholders before using live services.'
  : 'No files changed. Existing local configuration was preserved.');
