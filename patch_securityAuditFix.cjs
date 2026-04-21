const fs = require('fs');

let code = fs.readFileSync('src/components/admin/SecurityAudit.jsx', 'utf8');

const targetFix = `      )}
    </div>

      <div className="glass-effect rounded-xl p-6 mt-8">`;
const replacementFix = `      )}

      <div className="glass-effect rounded-xl p-6 mt-8">`;

if (code.includes(targetFix)) {
    code = code.replace(targetFix, replacementFix);
    fs.writeFileSync('src/components/admin/SecurityAudit.jsx', code);
}
