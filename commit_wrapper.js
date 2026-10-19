const { execSync } = require('child_process');
try {
  execSync('git push -f origin feat/core-wave-118-dag-and-embedding-fallback-13069803318979439577:feat/core-wave-118-dag-and-embedding-fallback-13069803318979439577');
} catch (e) {
  console.log("Nothing to commit or error:", e.message);
}
