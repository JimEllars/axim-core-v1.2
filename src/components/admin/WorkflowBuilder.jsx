import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  Panel
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import WorkflowExecutionLog from './WorkflowExecutionLog';
import api from '../../services/onyxAI/api';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

const { FiPlus, FiSave, FiPlay, FiTrash2, FiLayers, FiSettings, FiArrowRight, FiGitMerge, FiClock, FiFileText, FiMove } = FiIcons;

const TriggerNode = ({ data }) => {
  return (
    <div className="bg-indigo-900/30 border border-indigo-500/50 rounded-lg p-4 shadow-sm min-w-[200px]">
      <div className="flex items-center mb-2">
        <div className="w-8 h-8 rounded-full flex items-center justify-center mr-3 bg-indigo-500/20 text-indigo-400">
          <SafeIcon icon={FiPlay} size={16} />
        </div>
        <div>
          <h4 className="text-sm font-medium text-white">{data.label}</h4>
          <p className="text-xs text-slate-400">Initiates workflow</p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-indigo-400" />
    </div>
  );
};

const ActionNode = ({ data }) => {
  return (
    <div className="bg-onyx-950 border border-onyx-accent/20 rounded-lg p-4 shadow-sm min-w-[200px]">
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-slate-400" />
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full flex items-center justify-center mr-3 bg-onyx-900 text-slate-300 border border-slate-700">
            <SafeIcon icon={FiSettings} size={16} />
          </div>
          <div>
            <h4 className="text-sm font-medium text-white">{data.label}</h4>
            <p className="text-xs text-slate-400">Executes a task</p>
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-slate-400" />
    </div>
  );
};

const ConditionNode = ({ data }) => {
  return (
    <div className="bg-yellow-900/20 border border-yellow-600/50 rounded-lg p-4 shadow-sm min-w-[200px]">
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-yellow-400" />
      <div className="flex items-center mb-2">
        <div className="w-8 h-8 rounded-full flex items-center justify-center mr-3 bg-yellow-500/20 text-yellow-400">
          <SafeIcon icon={FiGitMerge} size={16} />
        </div>
        <div>
          <h4 className="text-sm font-medium text-white">{data.label}</h4>
          <p className="text-xs text-slate-400">Evaluates logic</p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} id="true" style={{ left: '30%' }} className="w-3 h-3 bg-green-400" />
      <Handle type="source" position={Position.Bottom} id="false" style={{ left: '70%' }} className="w-3 h-3 bg-red-400" />
    </div>
  );
};

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
};

const initialNodes = [
  { id: '1', type: 'trigger', position: { x: 250, y: 50 }, data: { label: 'Webhook Received' } },
  { id: '2', type: 'action', position: { x: 250, y: 200 }, data: { label: 'Format Payload' } },
];
const initialEdges = [{ id: 'e1-2', source: '1', target: '2' }];

const WorkflowBuilder = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('builder'); // builder, templates, history, schedule

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  // Rest of state variables as before
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [newScheduleCommand, setNewScheduleCommand] = useState('');
  const [newScheduleCron, setNewScheduleCron] = useState('');
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [savedWorkflows, setSavedWorkflows] = useState([]);

  useEffect(() => {
    if (activeTab === 'schedule') {
      loadScheduledTasks();
    } else if (activeTab === 'templates') {
      loadWorkflows();
    }
  }, [activeTab]);

  const loadScheduledTasks = async () => {
    try {
      const data = await api.getSystemMetrics();
      if (data?.data?.fleet?.schedule) {
         const tasks = data.data.fleet.schedule.map((task, i) => ({
             id: task.id || i,
             command: task.command,
             schedule: task.cron
         }));
         setScheduledTasks(tasks);
      }
    } catch (err) {
      console.error('Failed to load scheduled tasks', err);
    }
  };

  const loadWorkflows = async () => {
    try {
      // Mocked for now. In real app, call api to get workflows
      setSavedWorkflows([
         { id: 'w1', name: 'Lead Process', description: 'Process new leads from Webhook' },
         { id: 'w2', name: 'Weekly Report', description: 'Generate weekly fleet status' }
      ]);
    } catch(err) {
      console.error(err);
    }
  };

  const handleAddSchedule = async (e) => {
    e.preventDefault();
    if (!newScheduleCommand || !newScheduleCron) {
       toast.error("Please fill in both fields");
       return;
    }
    toast.success("Schedule added (mocked)");
    setScheduledTasks([...scheduledTasks, { id: Date.now(), command: newScheduleCommand, schedule: newScheduleCron }]);
    setShowScheduleForm(false);
    setNewScheduleCommand('');
    setNewScheduleCron('');
  };

  const handleRemoveSchedule = async (id) => {
    toast.success("Schedule removed (mocked)");
    setScheduledTasks(scheduledTasks.filter(t => t.id !== id));
  };

  const handleAddNode = (type) => {
    const newNode = {
      id: `node_${Date.now()}`,
      type,
      position: { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 },
      data: { label: `New ${type.charAt(0).toUpperCase() + type.slice(1)}` },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const renderBuilder = () => (
    <div className="h-[600px] border border-onyx-accent/20 rounded-lg overflow-hidden bg-onyx-950 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background color="#334155" gap={16} />
        <MiniMap nodeStrokeColor={(n) => {
            if (n.type === 'trigger') return '#6366f1';
            if (n.type === 'action') return '#94a3b8';
            if (n.type === 'condition') return '#eab308';
            return '#eee';
          }}
          nodeColor={(n) => {
            if (n.type === 'trigger') return 'rgba(99, 102, 241, 0.2)';
            if (n.type === 'action') return '#0f172a';
            if (n.type === 'condition') return 'rgba(234, 179, 8, 0.2)';
            return '#fff';
          }}
        />
        <Controls />
        <Panel position="top-left" className="flex gap-2">
            <button
              onClick={() => handleAddNode('trigger')}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs transition-colors flex items-center"
            >
              <SafeIcon icon={FiPlus} className="mr-1" /> Trigger
            </button>
            <button
              onClick={() => handleAddNode('action')}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-md text-xs transition-colors flex items-center"
            >
              <SafeIcon icon={FiPlus} className="mr-1" /> Action
            </button>
            <button
              onClick={() => handleAddNode('condition')}
              className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded-md text-xs transition-colors flex items-center"
            >
              <SafeIcon icon={FiPlus} className="mr-1" /> Condition
            </button>
        </Panel>
      </ReactFlow>
    </div>
  );

  const loadTemplate = (id) => {
    // Basic mock templates
    if (id === 'auto-reply') {
      setNodes([
        { id: '1', type: 'trigger', position: { x: 250, y: 50 }, data: { label: 'New Lead' } },
        { id: '2', type: 'action', position: { x: 250, y: 150 }, data: { label: 'Send Email' } }
      ]);
      setEdges([{ id: 'e1-2', source: '1', target: '2' }]);
    } else {
      setNodes([
        { id: '1', type: 'trigger', position: { x: 250, y: 50 }, data: { label: 'Cron Trigger' } },
        { id: '2', type: 'action', position: { x: 250, y: 150 }, data: { label: 'Run Export' } }
      ]);
      setEdges([{ id: 'e1-2', source: '1', target: '2' }]);
    }
    setActiveTab('builder');
    toast.success("Template loaded");
  };

  const loadCustomWorkflow = (workflow) => {
    // In real app we parse definition from db, here we just mock
    setNodes([
        { id: '1', type: 'trigger', position: { x: 250, y: 50 }, data: { label: 'Webhook Received' } },
        { id: '2', type: 'action', position: { x: 250, y: 150 }, data: { label: 'Custom Task' } }
    ]);
    setEdges([{ id: 'e1-2', source: '1', target: '2' }]);
    setActiveTab('builder');
    toast.success(`Loaded workflow: ${workflow.name}`);
  };

  const renderTemplates = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-white mb-4">Saved Workflows</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {savedWorkflows.length === 0 ? (
            <p className="text-sm text-slate-500 italic col-span-3">No saved workflows found.</p>
          ) : (
            savedWorkflows.map((wf, idx) => (
              <div key={wf.id || idx} onClick={() => loadCustomWorkflow(wf)} className="bg-onyx-950 border border-onyx-accent/20 rounded-lg p-4 hover:border-indigo-500 transition-colors cursor-pointer group">
                <h4 className="text-white font-medium mb-2 group-hover:text-indigo-400">{wf.name}</h4>
                <p className="text-sm text-slate-400 mb-4">{wf.description || 'No description provided.'}</p>
                <button className="text-indigo-400 text-sm font-medium hover:text-indigo-300">Edit Workflow &rarr;</button>
              </div>
            ))
          )}
        </div>
      </div>
      <div>
        <h3 className="text-lg font-medium text-white mb-4">System Templates</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { id: 'auto-reply', title: 'New Lead Auto-Reply', desc: 'Send an email when a new lead is added.' },
            { id: 'export', title: 'Weekly Summary Export', desc: 'Export AI interactions to Drive every Friday.' },
            { id: 'routing', title: 'Support Ticket Routing', desc: 'Route webhook tickets based on priority.' }
          ].map((tpl) => (
            <div key={tpl.id} onClick={() => loadTemplate(tpl.id)} className="bg-onyx-950 border border-onyx-accent/20 rounded-lg p-4 hover:border-indigo-500 transition-colors cursor-pointer group opacity-60">
               <h4 className="text-white font-medium mb-2 group-hover:text-indigo-400">{tpl.title}</h4>
               <p className="text-sm text-slate-400 mb-4">{tpl.desc}</p>
               <button className="text-indigo-400 text-sm font-medium hover:text-indigo-300">Use Template &rarr;</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderHistory = () => (
    <div className="bg-onyx-950 border border-onyx-accent/20 rounded-lg overflow-hidden p-4">
      <WorkflowExecutionLog />
    </div>
  );

  const renderSchedule = () => (
    <div className="bg-onyx-950 border border-onyx-accent/20 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-white font-medium">Scheduled Executions</h3>
        {!showScheduleForm && (
          <button
            onClick={() => setShowScheduleForm(true)}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded transition-colors"
          >
            Add Schedule
          </button>
        )}
      </div>

      {showScheduleForm && (
        <form onSubmit={handleAddSchedule} className="mb-6 bg-onyx-950 p-4 rounded-lg border border-onyx-accent/20 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Command to Execute</label>
            <input
              type="text"
              value={newScheduleCommand}
              onChange={(e) => setNewScheduleCommand(e.target.value)}
              placeholder="e.g. Run weekly export workflow"
              className="w-full bg-onyx-950 border border-onyx-accent/20 rounded px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">CRON Expression</label>
            <input
              type="text"
              value={newScheduleCron}
              onChange={(e) => setNewScheduleCron(e.target.value)}
              placeholder="e.g. 0 17 * * 5 (Every Friday at 5 PM)"
              className="w-full bg-onyx-950 border border-onyx-accent/20 rounded px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowScheduleForm(false)}
              className="px-3 py-1.5 text-slate-400 hover:text-white text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm transition-colors"
            >
              Save Schedule
            </button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {scheduledTasks.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No scheduled tasks found.</p>
        ) : (
          scheduledTasks.map(task => (
            <div key={task.id} className="flex justify-between items-center p-4 bg-onyx-950 rounded-md border border-onyx-accent/20">
               <div>
                 <div className="font-medium text-white">{task.command}</div>
                 <div className="text-sm text-slate-400 font-mono mt-1">Schedule: {task.schedule}</div>
               </div>
               <button
                onClick={() => handleRemoveSchedule(task.id)}
                className="text-red-400 hover:text-red-300 p-2"
               >
                 <SafeIcon icon={FiTrash2} size={16} />
               </button>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="bg-onyx-950 rounded-lg p-6 border border-onyx-accent/20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 space-y-4 md:space-y-0">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center">
            <SafeIcon icon={FiLayers} className="mr-2 text-indigo-400" />
            Workflow Builder
          </h2>
          <p className="text-sm text-slate-400">Visually orchestrate your business logic (Preview)</p>
        </div>
        {activeTab === 'builder' && (
          <div className="flex gap-3">
            <button className="flex items-center px-4 py-2 bg-onyx-950 hover:bg-onyx-accent/10 text-white text-sm rounded-md transition-colors">
              <SafeIcon icon={FiPlay} className="mr-2" />
              Test Run
            </button>
            <button
              onClick={async () => {
                if (!user?.id) {
                  toast.error("User not authenticated.");
                  return;
                }
                try {
                  const definition = { nodes, edges };
                  const workflowName = "Custom Workflow " + Date.now();
                  const workflowSlug = "custom_wf_" + Date.now();

                  await api.createWorkflow(
                      workflowName,
                      "Generated workflow",
                      workflowSlug,
                      definition,
                      user.id
                  );
                  toast.success("Workflow saved to database!");
                  loadWorkflows();
                } catch (err) {
                  toast.error("Failed to save workflow.");
                }
              }}
              className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-md transition-colors shadow-lg shadow-indigo-500/20">
              <SafeIcon icon={FiSave} className="mr-2" />
              Save Workflow
            </button>
          </div>
        )}
      </div>

      {/* Internal Tabs */}
      <div className="flex space-x-2 border-b border-onyx-accent/20 mb-6">
        {[
          { id: 'builder', label: 'Builder', icon: FiLayers },
          { id: 'templates', label: 'Templates', icon: FiFileText },
          { id: 'history', label: 'History', icon: FiClock },
          { id: 'schedule', label: 'Schedule', icon: FiClock },
        ].map(tab => (
           <button
             key={tab.id}
             onClick={() => setActiveTab(tab.id)}
             className={`flex items-center px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
               activeTab === tab.id ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
             }`}
           >
             <SafeIcon icon={tab.icon} className="mr-2" size={14} />
             {tab.label}
           </button>
        ))}
      </div>

      {activeTab === 'builder' && renderBuilder()}
      {activeTab === 'templates' && renderTemplates()}
      {activeTab === 'history' && renderHistory()}
      {activeTab === 'schedule' && renderSchedule()}

    </div>
  );
};

export default WorkflowBuilder;
