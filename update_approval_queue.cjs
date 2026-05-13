const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/layout/ApprovalQueue.jsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
  "import React, { useEffect } from 'react';",
  "import React, { useEffect, useState } from 'react';"
);

content = content.replace(
  "const ApprovalQueue = ({ isOpen, onClose, pendingLogs, setPendingLogs }) => {",
  "const ApprovalQueue = ({ isOpen, onClose, pendingLogs, setPendingLogs }) => {\n  const [editedPayloads, setEditedPayloads] = useState({});"
);

content = content.replace(
  "    const handleApprove = async (logId, actionPayload) => {",
  `    const handleApprove = async (logId, actionPayload) => {\n      const finalPayload = editedPayloads[logId] !== undefined ? { ...actionPayload, html_content: editedPayloads[logId] } : actionPayload;`
);

content = content.replace(
  "await api.resolveHitlAction(logId, 'Approved', actionPayload);",
  "await api.resolveHitlAction(logId, 'Approved', finalPayload);"
);

content = content.replace(
  "<p className=\"mt-1 truncate\">{parsedPayload.html_content.substring(0, 150)}...</p>",
  `<textarea\n                           className="mt-1 w-full bg-onyx-900 border border-onyx-accent/30 rounded p-2 text-slate-300 focus:outline-none focus:border-indigo-500"\n                           rows={4}\n                           value={editedPayloads[log.id] !== undefined ? editedPayloads[log.id] : parsedPayload.html_content}\n                           onChange={(e) => setEditedPayloads(prev => ({ ...prev, [log.id]: e.target.value }))}\n                         />`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log("ApprovalQueue.jsx updated.");
