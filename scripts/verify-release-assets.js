const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const exe = `EasyCraft-Launcher-Setup-${version}.exe`;
const blockmap = `${exe}.blockmap`;
const latest = 'latest.yml';

function fail(message) {
  console.error(`RELEASE ASSET CHECK FAIL: ${message}`);
  process.exit(1);
}

for (const name of [exe, blockmap, latest]) {
  const file = path.join(dist, name);
  if (!fs.existsSync(file)) fail(`missing dist/${name}`);
  if (fs.statSync(file).size <= 0) fail(`dist/${name} is empty`);
}

const yaml = fs.readFileSync(path.join(dist, latest), 'utf8');
if (!new RegExp(`^version:\\s*${version.replace(/\./g, '\\.') }\\s*$`, 'mi').test(yaml)) {
  fail(`latest.yml version is not ${version}`);
}
if (!yaml.includes(exe)) fail(`latest.yml does not reference ${exe}`);

console.log(`RELEASE ASSET CHECK OK: ${exe}, ${blockmap}, latest.yml (version ${version})`);
