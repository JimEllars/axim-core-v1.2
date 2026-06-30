const { execSync } = require('child_process');
const fs = require('fs');
const glob = require('glob');

const testFiles = glob.sync('{src,tests}/**/*.{test,spec}.{js,jsx}');
console.log(`Found ${testFiles.length} test files. Running one by one to find the hanger...`);

for (const file of testFiles) {
    console.log(`Running ${file}...`);
    try {
        execSync(`npx vitest run ${file}`, { stdio: 'inherit', timeout: 10000 });
    } catch (e) {
        console.error(`\n\n>>> HANG OR FAILURE IN ${file} <<<\n\n`);
        process.exit(1);
    }
}
console.log('All tests finished successfully.');
