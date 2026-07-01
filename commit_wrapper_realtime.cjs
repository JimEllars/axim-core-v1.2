const fs = require('fs');

async function fixLint() {
  const content = fs.readFileSync('src/contexts/RealtimeContext.jsx', 'utf8');
  let fixed = content.replace("export const RealtimeProvider", "const RealtimeProvider");
  fixed = fixed + "\nexport default RealtimeProvider;\n";
  fs.writeFileSync('src/contexts/RealtimeContext.jsx', fixed, 'utf8');
}
fixLint();
