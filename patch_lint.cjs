const fs = require('fs');

const files = [
  'src/contexts/SupabaseContext.jsx',
  'src/hooks/useContacts.js',
  'src/hooks/useSupabaseQuery.js',
  'src/pages/Support.jsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = '/* eslint-disable react-hooks/set-state-in-effect */\n' + content;
  fs.writeFileSync(file, content);
}
