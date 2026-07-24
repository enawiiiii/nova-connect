import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
if (status) {
  console.error('Refusing to package a dirty worktree. Commit and verify the exact sale candidate first.');
  process.exit(1);
}

execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'verify:sale'], { stdio: 'inherit' });

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const shortCommit = commit.slice(0, 12);
const outputDirectory = path.join(root, 'outputs', `sale-${packageJson.version}-${shortCommit}`);
mkdirSync(outputDirectory, { recursive: true });

const archiveName = `nova-connect-${packageJson.version}-${shortCommit}.zip`;
const archivePath = path.join(outputDirectory, archiveName);
execFileSync('git', ['archive', '--format=zip', '--prefix=nova-connect/', `--output=${archivePath}`, 'HEAD']);

const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const sbom = execFileSync(npmExecutable, ['sbom', '--sbom-format', 'cyclonedx', '--omit', 'dev'], {
  encoding: 'utf8',
  maxBuffer: 100 * 1024 * 1024,
});
writeFileSync(path.join(outputDirectory, 'sbom.cdx.json'), sbom);

const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const licenseRows = [['Package path', 'Version', 'License']];
for (const [packagePath, metadata] of Object.entries(lock.packages ?? {})) {
  if (!packagePath.startsWith('node_modules/') || !metadata.version) continue;
  const license = Array.isArray(metadata.license) ? metadata.license.join(' OR ') : (metadata.license ?? 'UNKNOWN');
  licenseRows.push([packagePath.replace(/^node_modules\//, ''), metadata.version, license]);
}
const csv = licenseRows
  .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
  .join('\n');
writeFileSync(path.join(outputDirectory, 'third-party-licenses.csv'), `${csv}\n`);

const artifacts = ['sbom.cdx.json', 'third-party-licenses.csv', archiveName];
const checksums = artifacts.map((name) => {
  const digest = crypto.createHash('sha256').update(readFileSync(path.join(outputDirectory, name))).digest('hex');
  return `${digest}  ${name}`;
});
writeFileSync(path.join(outputDirectory, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`);
writeFileSync(path.join(outputDirectory, 'release-manifest.json'), `${JSON.stringify({
  product: packageJson.name,
  version: packageJson.version,
  commit,
  createdAt: new Date().toISOString(),
  contents: [...artifacts, 'SHA256SUMS.txt'],
}, null, 2)}\n`);

console.log(`Sale package created at ${outputDirectory}`);
