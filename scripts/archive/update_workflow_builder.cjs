const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/admin/WorkflowBuilder.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const componentsSection = `        {/* Left Sidebar: Components */}
        <div className="lg:col-span-1 bg-onyx-950/50 rounded-md p-4 border border-onyx-accent/20">
          <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Triggers</h3>
          <div className="space-y-3 mb-6">
            <button
              onClick={() => addNode('trigger', 'LIVE_STREAM_STARTED')}
              className="w-full text-left px-3 py-2 bg-onyx-950 hover:bg-onyx-accent/10 border border-onyx-accent/20 rounded-md text-sm text-slate-300 flex items-center transition-colors"
            >
              <div className="w-6 h-6 rounded bg-indigo-500/20 text-indigo-400 flex items-center justify-center mr-3">
                <SafeIcon icon={FiPlay} size={14} />
              </div>
              Live Stream Started
            </button>
            <button
              onClick={() => addNode('trigger', 'PODCAST_PUBLISHED')}
              className="w-full text-left px-3 py-2 bg-onyx-950 hover:bg-onyx-accent/10 border border-onyx-accent/20 rounded-md text-sm text-slate-300 flex items-center transition-colors"
            >
              <div className="w-6 h-6 rounded bg-indigo-500/20 text-indigo-400 flex items-center justify-center mr-3">
                <SafeIcon icon={FiPlay} size={14} />
              </div>
              Podcast Published
            </button>
            <button
              onClick={() => addNode('trigger', 'NEW_LEAD')}
              className="w-full text-left px-3 py-2 bg-onyx-950 hover:bg-onyx-accent/10 border border-onyx-accent/20 rounded-md text-sm text-slate-300 flex items-center transition-colors"
            >
              <div className="w-6 h-6 rounded bg-indigo-500/20 text-indigo-400 flex items-center justify-center mr-3">
                <SafeIcon icon={FiPlay} size={14} />
              </div>
              New Lead
            </button>
          </div>

          <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Actions</h3>
          <div className="space-y-3">
            <button
              onClick={() => addNode('action', 'Draft Post')}
              className="w-full text-left px-3 py-2 bg-onyx-950 hover:bg-onyx-accent/10 border border-onyx-accent/20 rounded-md text-sm text-slate-300 flex items-center transition-colors"
            >
              <div className="w-6 h-6 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center mr-3">
                <SafeIcon icon={FiSettings} size={14} />
              </div>
              Draft Post
            </button>
            <button
              onClick={() => addNode('action', 'Send Email')}
              className="w-full text-left px-3 py-2 bg-onyx-950 hover:bg-onyx-accent/10 border border-onyx-accent/20 rounded-md text-sm text-slate-300 flex items-center transition-colors"
            >
              <div className="w-6 h-6 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center mr-3">
                <SafeIcon icon={FiSettings} size={14} />
              </div>
              Send Email
            </button>
            <button
              onClick={() => addNode('action', 'Assign Task')}
              className="w-full text-left px-3 py-2 bg-onyx-950 hover:bg-onyx-accent/10 border border-onyx-accent/20 rounded-md text-sm text-slate-300 flex items-center transition-colors"
            >
              <div className="w-6 h-6 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center mr-3">
                <SafeIcon icon={FiSettings} size={14} />
              </div>
              Assign Task
            </button>
            <button
              onClick={() => addNode('condition', 'Condition')}
              className="w-full text-left px-3 py-2 bg-onyx-950 hover:bg-onyx-accent/10 border border-onyx-accent/20 rounded-md text-sm text-slate-300 flex items-center transition-colors"
            >
              <div className="w-6 h-6 rounded bg-yellow-500/20 text-yellow-400 flex items-center justify-center mr-3">
                <SafeIcon icon={FiGitMerge} size={14} />
              </div>
              Condition
            </button>
          </div>
        </div>`;

content = content.replace(
  /\{\/\* Left Sidebar: Components \*\/\}[\s\S]*?(?=\{\/\* Right Area: Linear Representation \*\/)/m,
  componentsSection + '\n\n'
);

content = content.replace(
  "const addNode = (type) => {",
  "const addNode = (type, label = null) => {"
);

content = content.replace(
  "label: type === 'action' ? 'New Action' : 'New Condition'",
  "label: label || (type === 'action' ? 'New Action' : 'New Condition')"
);

fs.writeFileSync(filePath, content, 'utf8');
console.log("WorkflowBuilder.jsx updated.");
