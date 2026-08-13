const fs = require('fs');
const path = require('path');

const prTitle = process.env.PR_TITLE || 'Wave 114: Reissuing Unlanded Correctness Fixes';
const prBody = process.env.PR_BODY || 'Reissued unlanded fixes, added KV activation, updated CHANGELOG automation, and added BD/CRM tests.';
const prNumber = process.env.PR_NUMBER || '344';

const changelogPath = path.join(__dirname, '../CHANGELOG.md');

let newEntry = `## ${prTitle} (#${prNumber})\n\n`;
if (prBody) {
    newEntry += `${prBody}\n\n`;
}

try {
    const currentChangelog = fs.readFileSync(changelogPath, 'utf8');
    // Insert after the main heading or at top
    let updated = '';
    if (currentChangelog.startsWith('# Changelog')) {
        updated = currentChangelog.replace('# Changelog\n\n', `# Changelog\n\n${newEntry}`);
    } else {
        updated = newEntry + currentChangelog;
    }
    fs.writeFileSync(changelogPath, updated, 'utf8');
    console.log(`Successfully updated CHANGELOG.md with PR #${prNumber}`);
} catch(e) {
    console.error('Error updating CHANGELOG.md:', e);
}
