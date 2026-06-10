const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const testDir = path.join(__dirname, 'test');
const files = fs.readdirSync(testDir)
  .filter(f => f.endsWith('.test.js'))
  .sort();

// Also include benchmark_runner.js if it's considered a test
if (fs.existsSync(path.join(testDir, 'benchmark_runner.js'))) {
  files.push('benchmark_runner.js');
}

console.log('Running tests sequentially to prevent concurrent bypass login conflicts...\n');

let failed = false;
for (const file of files) {
  console.log(`=========================================`);
  console.log(`RUNNING: ${file}`);
  console.log(`=========================================`);
  try {
    execSync(`node --test "${path.join('test', file)}"`, { stdio: 'inherit' });
    console.log(`SUCCESS: ${file}\n`);
  } catch (err) {
    console.error(`FAILED: ${file}\n`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}
