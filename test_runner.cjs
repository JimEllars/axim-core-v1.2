const { execSync } = require('child_process');

try {
  console.log("Running all tests...");
  execSync('npm run test', { stdio: 'inherit' });
  console.log("Tests passed!");
} catch (error) {
  console.error("Some tests failed.");
  process.exit(1);
}
