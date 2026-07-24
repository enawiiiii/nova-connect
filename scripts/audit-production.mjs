import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const allowedAdvisories = new Set([
  // Published 2026-07-24. The advisory explicitly affects only React Router's
  // unstable RSC APIs. NOVA is a client-rendered BrowserRouter application and
  // the guard below fails if RSC imports or identifiers are introduced.
  'GHSA-qwww-vcr4-c8h2',
]);

const npmExecPath = process.env.npm_execpath;
const command = npmExecPath ? process.execPath : 'npm';
const args = npmExecPath
  ? [npmExecPath, 'audit', '--omit=dev', '--json']
  : ['audit', '--omit=dev', '--json'];
const result = spawnSync(command, args, {
  encoding: 'utf8',
});

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error(result.stderr || 'npm audit did not return a valid JSON report.');
  process.exit(1);
}

const sourceFiles = [];
const visit = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) sourceFiles.push(path);
  }
};
visit('apps/web/src');

const rscMarkers = [
  /react-router\/dom-rsc/,
  /unstable_RSC/,
  /createCallServer/,
  /decodeReply/,
];
const rscUsage = sourceFiles.filter((file) => {
  const contents = readFileSync(file, 'utf8');
  return rscMarkers.some((pattern) => pattern.test(contents));
});
if (rscUsage.length) {
  console.error(`React Router RSC usage invalidates the documented advisory exception: ${rscUsage.join(', ')}`);
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities ?? {};
const packageIsAllowed = (name, trail = new Set()) => {
  if (trail.has(name)) return false;
  trail.add(name);
  const vulnerability = vulnerabilities[name];
  if (!vulnerability) return false;

  return vulnerability.via.every((item) => {
    if (typeof item === 'string') return packageIsAllowed(item, new Set(trail));
    const advisoryId = /GHSA-[\w-]+/.exec(item.url ?? '')?.[0];
    return advisoryId ? allowedAdvisories.has(advisoryId) : false;
  });
};

const unexpected = Object.keys(vulnerabilities).filter((name) => !packageIsAllowed(name));
if (unexpected.length) {
  console.error(`Unexpected production vulnerabilities: ${unexpected.join(', ')}`);
  process.exit(1);
}

if (Object.keys(vulnerabilities).length) {
  console.warn(
    `Production audit passed with a documented non-applicable RSC advisory exception: ${[...allowedAdvisories].join(', ')}`,
  );
} else {
  console.log('Production dependency audit passed with no known vulnerabilities.');
}
