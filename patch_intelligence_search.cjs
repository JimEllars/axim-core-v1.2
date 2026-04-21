const fs = require('fs');

let intelligenceHubCode = fs.readFileSync('src/components/admin/IntelligenceHub.jsx', 'utf8');

const targetScore = `Match Score: {(result.similarity * 100).toFixed(1)}%`;
const replacementScore = `<span className={\`font-bold \${result.similarity > 0.8 ? 'text-green-400' : result.similarity > 0.6 ? 'text-yellow-400' : 'text-red-400'}\`}>Match Score: {(result.similarity * 100).toFixed(1)}%</span>`;

if (intelligenceHubCode.includes(targetScore)) {
    intelligenceHubCode = intelligenceHubCode.replace(targetScore, replacementScore);
    fs.writeFileSync('src/components/admin/IntelligenceHub.jsx', intelligenceHubCode);
}

let memoryBankCode = fs.readFileSync('src/components/admin/MemoryBank.jsx', 'utf8');
if (memoryBankCode.includes(targetScore)) {
    memoryBankCode = memoryBankCode.replace(targetScore, replacementScore);
    fs.writeFileSync('src/components/admin/MemoryBank.jsx', memoryBankCode);
}
