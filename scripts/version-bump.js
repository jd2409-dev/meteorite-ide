#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, '../package.json');
const pkg = require(packagePath);

const [, , type = 'patch'] = process.argv;

const validTypes = ['major', 'minor', 'patch'];
if (!validTypes.includes(type)) {
  console.error(`❌ Invalid version type: ${type}`);
  console.error(`Valid types: ${validTypes.join(', ')}`);
  process.exit(1);
}

const currentVersion = pkg.version;
const [major, minor, patch] = currentVersion.split('.').map(Number);

let newVersion;
switch (type) {
  case 'major':
    newVersion = `${major + 1}.0.0`;
    break;
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
  default:
    newVersion = `${major}.${minor}.${patch + 1}`;
    break;
}

pkg.version = newVersion;
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');

console.log('');
console.log('╔═══════════════════════════════════════════════════════╗');
console.log('║   Version Bump Utility                                ║');
console.log('╚═══════════════════════════════════════════════════════╝');
console.log('');
console.log(`Current version: ${currentVersion}`);
console.log(`New version:     ${newVersion}`);
console.log(`Type:            ${type}`);
console.log('');
console.log('✅ Version updated in package.json');
console.log('');
console.log('Next steps:');
console.log('');
console.log('  1. Review the changes:');
console.log('     git diff package.json');
console.log('');
console.log('  2. Commit the version bump:');
console.log(`     git add package.json`);
console.log(`     git commit -m "chore: bump version to ${newVersion}"`);
console.log('');
console.log('  3. Create a git tag:');
console.log(`     git tag v${newVersion}`);
console.log('');
console.log('  4. Push changes and tags:');
console.log('     git push && git push --tags');
console.log('');
