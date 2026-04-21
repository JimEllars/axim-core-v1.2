const fs = require('fs');
let code = fs.readFileSync('src/components/admin/WorkflowBuilder.jsx', 'utf8');

// The WorkflowBuilder currently saves a workflow with `definition: { steps: nodes }`
// The nodes are like { id: '...', type: 'trigger', label: '...' }
// The engine expects steps like:
// { name: step.name, type: step.type, config: step.config }
// We need to map nodes to standard engine steps before saving.

const saveCodeToReplace = `                const definition = { steps: nodes };
                  await api.createWorkflow(`;

const saveCodeReplacement = `                const steps = nodes.map((node, index) => {
                  let config = {};
                  if (node.type === 'action') {
                     config = {
                        service: 'foreman-os',
                        endpoint: 'status',
                        payload: { node_id: node.id }
                     };
                  }
                  if (node.type === 'condition') {
                     config = { query: 'users' };
                  }
                  return {
                     name: node.label,
                     type: node.type === 'trigger' ? 'trigger' : (node.type === 'action' ? 'api_call' : 'query_database'),
                     config
                  };
                });
                const definition = { steps };
                await api.createWorkflow(`;

code = code.replace(saveCodeToReplace, saveCodeReplacement);
fs.writeFileSync('src/components/admin/WorkflowBuilder.jsx', code);
