const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function repositoryFromRemote() {
  try {
    const url = cp.execSync('git config --get remote.origin.url', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const m = url.match(/github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/i);
    return m ? `${m[1]}/${m[2]}` : '';
  } catch { return ''; }
}

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
function repositoryFromPackage() {
  const url = String(pkg?.repository?.url || '');
  const m = url.match(/github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/i);
  return m ? `${m[1]}/${m[2]}` : '';
}
const repository = process.env.GITHUB_REPOSITORY || repositoryFromRemote() || repositoryFromPackage();
const out = {
  repository,
  builtAt: new Date().toISOString(),
  updateChannel: 'latest',
  version: pkg.version
};
fs.writeFileSync(path.join(__dirname, '..', 'src', 'build-info.json'), JSON.stringify(out, null, 2));
console.log(`Build info repository: ${repository || '(not detected)'}`);
