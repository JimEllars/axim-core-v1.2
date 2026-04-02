const affiliateLinks = {
  'solar': 'https://example.com/solar-affiliate',
  'energy': 'https://example.com/energy-affiliate',
  'foreman': 'https://foremanos.com/affiliate',
  'software': 'https://example.com/software-affiliate',
  'AI': 'https://example.com/ai-tools-affiliate',
  'automation': 'https://example.com/automation-affiliate',
  'growth': 'https://example.com/growth-affiliate'
};

const precompiledRegexes = Object.entries(affiliateLinks).map(([keyword, link]) => ({
    regex: new RegExp(`\\b(${keyword})\\b`, 'i'),
    link
}));

const content = "This is a long article about solar energy and AI automation software. Foreman is great for growth.";

function runOld() {
    let articleContent = content;
    let injectedCount = 0;
    Object.entries(affiliateLinks).forEach(([keyword, link]) => {
        const regex = new RegExp(`\\b(${keyword})\\b`, 'i');
        if (regex.test(articleContent)) {
            if (!articleContent.includes(`](${link})`)) {
                 articleContent = articleContent.replace(regex, `[$1](${link})`);
                 injectedCount++;
            }
        }
    });
    return articleContent;
}

function runNew() {
    let articleContent = content;
    let injectedCount = 0;
    precompiledRegexes.forEach(({ regex, link }) => {
        if (regex.test(articleContent)) {
            if (!articleContent.includes(`](${link})`)) {
                 articleContent = articleContent.replace(regex, `[$1](${link})`);
                 injectedCount++;
            }
        }
    });
    return articleContent;
}

// Warmup
for (let i = 0; i < 1000; i++) { runOld(); runNew(); }

const startOld = performance.now();
for (let i = 0; i < 50000; i++) runOld();
const endOld = performance.now();

const startNew = performance.now();
for (let i = 0; i < 50000; i++) runNew();
const endNew = performance.now();

console.log(`Old (Regex inside loop): ${(endOld - startOld).toFixed(2)}ms`);
console.log(`New (Precompiled Regex): ${(endNew - startNew).toFixed(2)}ms`);
console.log(`Improvement: ${(((endOld - startOld) - (endNew - startNew)) / (endOld - startOld) * 100).toFixed(2)}%`);
