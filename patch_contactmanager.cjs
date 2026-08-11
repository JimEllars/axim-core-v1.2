const fs = require('fs');
const file = 'src/components/dashboard/ContactManager.jsx';
let content = fs.readFileSync(file, 'utf8');

// Add toast and supabase imports if needed
if (!content.includes("import { toast } from 'react-hot-toast';")) {
  content = content.replace("import React,", "import { toast } from 'react-hot-toast';\nimport React,");
}
if (!content.includes("import { useSupabase } from '../../contexts/SupabaseContext';")) {
  content = content.replace("import React,", "import { useSupabase } from '../../contexts/SupabaseContext';\nimport React,");
}

// Add handleAIQualify inside the component
const handleAIQualifyMatch = "const handleAIQualify = async (lead) => {\n         toast.success('Initiating AI Qualification...');\n         try {\n           const response = await supabase.functions.invoke('lead-triage', { body: { lead_id: lead.id } });\n           if(response.error) throw new Error(response.error.message || 'Error from edge function');\n           toast.success('Lead scored successfully.');\n           fetchContacts(); // or refresh the local lead state\n         } catch (e) {\n           toast.error('AI Qualification failed.');\n           console.error(e);\n         }\n       };\n";

if (!content.includes('const handleAIQualify = async')) {
    content = content.replace('const handleOsintScan', handleAIQualifyMatch + '\n  const handleOsintScan');
}

// Ensure columns for score are added to the table
// Let's replace the column headers
const headerTarget = '<th scope="col" className="px-6 py-4 font-semibold tracking-wider">Email</th>';
const headerReplace = '<th scope="col" className="px-6 py-4 font-semibold tracking-wider">Email</th>\n              <th scope="col" className="px-6 py-4 font-semibold tracking-wider">Score</th>';
content = content.replace(headerTarget, headerReplace);

// Let's replace the td
const tdTarget = '<td className="px-6 py-4 text-slate-400">{contact.email}</td>';
const tdReplace = '<td className="px-6 py-4 text-slate-400">{contact.email}</td>\n                    <td className="px-6 py-4">\n                        <div className="flex flex-col">\n                            <span className={`font-semibold ${contact.lead_score >= 80 ? "text-green-400" : contact.lead_score >= 50 ? "text-yellow-400" : "text-slate-400"}`}>\n                                {contact.lead_score !== null && contact.lead_score !== undefined ? contact.lead_score : "-"}\n                            </span>\n                            {contact.ai_summary && <span className="text-xs text-slate-500 max-w-[200px] truncate" title={contact.ai_summary}>{contact.ai_summary}</span>}\n                        </div>\n                    </td>';

if (content.includes(tdTarget)) {
    content = content.replace(tdTarget, tdReplace);
}

// And the loading state colspan from 5 to 6
content = content.replace('<td colSpan="5" className="text-center p-8">', '<td colSpan="6" className="text-center p-8">');
content = content.replace('<td colSpan="5" className="p-8">', '<td colSpan="6" className="p-8">');

// For edit mode colspan
const editEmailTdTarget = '<td className="px-6 py-3">\n                      <input\n                        type="email"';
const editEmailTdReplace = '<td className="px-6 py-3"></td>\n                    <td className="px-6 py-3">\n                      <input\n                        type="email"';
content = content.replace(editEmailTdTarget, editEmailTdReplace);

// The AI Qualify Button
const actionDivTarget = '<div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">';
const aiQualifyBtn = '<button aria-label={`AI Qualify ${contact.name}`} onClick={() => handleAIQualify(contact)} className="px-2 py-1 text-xs bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 hover:text-purple-300 rounded transition-colors border border-purple-700/50" title="AI Qualify">AI Qualify</button>\n                            ';

content = content.replace(actionDivTarget, actionDivTarget + '\n                            ' + aiQualifyBtn);


// The same for the first table which seems to be telemetry leads
const firstTableOsintScanBtnTarget = '<button\n                      onClick={() => handleOsintScan(lead)}\n                      className="px-3 py-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 hover:text-blue-300 rounded text-xs font-medium transition-colors border border-blue-700/50"\n                    >\n                      OSINT Scan\n                    </button>';
const aiQualifyFirstTableBtn = '<button\n                      onClick={() => handleAIQualify(lead)}\n                      className="px-3 py-1.5 bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 hover:text-purple-300 rounded text-xs font-medium transition-colors border border-purple-700/50 mr-2"\n                    >\n                      AI Qualify\n                    </button>';

if (content.includes(firstTableOsintScanBtnTarget) && !content.includes(aiQualifyFirstTableBtn)) {
   content = content.replace(firstTableOsintScanBtnTarget, aiQualifyFirstTableBtn + '\n' + firstTableOsintScanBtnTarget);
}

fs.writeFileSync(file, content);
