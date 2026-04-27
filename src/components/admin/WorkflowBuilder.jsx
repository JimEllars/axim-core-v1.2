import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import WorkflowExecutionLog from './WorkflowExecutionLog';
import api from '../../services/onyxAI/api';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

const { FiPlus, FiSave, FiPlay, FiTrash2, FiLayers, FiSettings, FiArrowRight, FiGitMerge, FiClock, FiFileText, FiMove } = FiIcons;

const SortableNode = ({ node, index, isLast, onRemove }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: node.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative"
    >
      {/* Node Box */}
      <div className={`p-4 rounded-lg border shadow-sm flex items-center justify-between ${
        node.type === 'trigger' ? 'bg-indigo-900/30 border-indigo-500/50' :
        node.type === 'condition' ? 'bg-yellow-900/20 border-yellow-600/50' :
        'bg-onyx-950 border-onyx-accent/20'
      }`}>
        <div className="flex items-center">
          <div {...attributes} {...listeners} className="cursor-grab text-slate-500 mr-2 hover:text-slate-300">
            <SafeIcon icon={FiMove} size={16} />
          </div>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-4 ${
            node.type === 'trigger' ? 'bg-indigo-500/20 text-indigo-400' :
            node.type === 'condition' ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-onyx-950 text-slate-300'
          }`}>
            {node.type === 'trigger' ? <SafeIcon icon={FiPlay} size={16} /> :
             node.type === 'condition' ? <SafeIcon icon={FiGitMerge} size={16} /> :
             <SafeIcon icon={FiSettings} size={16} />}
          </div>
          <div>
            <h4 className="text-sm font-medium text-white">{node.label}</h4>
            <p className="text-xs text-slate-400">
              {node.type === 'trigger' ? 'Initiates the workflow' : 'Executes a task'}
            </p>
          </div>
        </div>
        {node.type !== 'trigger' && (
          <button
            onClick={() => onRemove(node.id)}
            className="text-slate-500 hover:text-red-400 p-2 rounded-md hover:bg-onyx-accent/20 transition-colors"
          >
            <SafeIcon icon={FiTrash2} size={16} />
          </button>
        )}
      </div>

      {/* Connection Line to Next Node */}
      {!isLast && (
        <div className="flex justify-center py-2 text-slate-600">
          <SafeIcon icon={FiArrowRight} className="rotate-90" size={20} />
        </div>
      )}
    </motion.div>
  );
};

const WorkflowBuilder = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('builder'); // builder, templates, history, schedule
  const [nodes, setNodes] = useState([
    { id: 'start', type: 'trigger', label: 'Webhook Received' }
  ]);
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [savedWorkflows, setSavedWorkflows] = useState([]);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [newScheduleCommand, setNewScheduleCommand] = useState('');
  const [newScheduleCron, setNewScheduleCron] = useState('');

  useEffect(() => {
    if (activeTab === 'schedule' && user?.id) {
      loadScheduledTasks();
    }
    if (user?.id) {
      loadWorkflows();
    }
  }, [activeTab, user]);

  const loadWorkflows = async () => {
    try {
      const workflows = await api.getWorkflows();
      setSavedWorkflows(workflows || []);
    } catch (error) {
      console.error("Failed to load workflows:", error);
    }
  };

  const loadScheduledTasks = async () => {
    try {
      const tasks = await api.getScheduledTasks(user.id);
      setScheduledTasks(tasks || []);
    } catch (error) {
      console.error("Failed to load scheduled tasks", error);
    }
  };

  const handleAddSchedule = async (e) => {
    e.preventDefault();
    if (!newScheduleCommand || !newScheduleCron) {
      toast.error('Command and cron schedule are required.');
      return;
    }

    try {
      await api.createScheduledTask(newScheduleCommand, newScheduleCron, user.id);
      toast.success('Scheduled task added.');
      setShowScheduleForm(false);
      setNewScheduleCommand('');
      setNewScheduleCron('');
      loadScheduledTasks();
    } catch (error) {
      toast.error('Failed to add scheduled task.');
    }
  };

  const handleRemoveSchedule = async (id) => {
    try {
      await api.deleteScheduledTask(id);
      toast.success('Scheduled task removed.');
      loadScheduledTasks();
    } catch (error) {
      toast.error('Failed to remove scheduled task.');
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setNodes((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        // Prevent moving trigger node
        if (items[oldIndex].type === 'trigger' || items[newIndex].type === 'trigger') {
          return items;
        }

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // This is a placeholder for a future interactive canvas (e.g., using React Flow)
  // For now, it displays a list representation of the workflow steps.

  const addNode = (type) => {
    const newNode = {
      id: `node-${Date.now()}`,
      type: type,
      label: type === 'action' ? 'New Action' : 'New Condition'
    };
    setNodes([...nodes, newNode]);
  };

  const removeNode = (id) => {
    if (id === 'start') return; // Cannot delete start node
    setNodes(nodes.filter(n => n.id !== id));
  };

  const loadTemplate = (templateId) => {
    if (templateId === 'auto-reply') {
      setNodes([
        { id: 'start', type: 'trigger', label: 'New Lead Added' },
        { id: 'node-1', type: 'condition', label: 'Check Lead Source' },
        { id: 'node-2', type: 'action', label: 'Send Welcome Email' }
      ]);
    } else if (templateId === 'export') {
      setNodes([
        { id: 'start', type: 'trigger', label: 'Scheduled Time Reached' },
        { id: 'node-1', type: 'action', label: 'Export Data to CSV' },
        { id: 'node-2', type: 'action', label: 'Upload to Google Drive' }
      ]);
    } else if (templateId === 'routing') {
      setNodes([
        { id: 'start', type: 'trigger', label: 'Support Ticket Received' },
        { id: 'node-1', type: 'condition', label: 'Check Priority' },
        { id: 'node-2', type: 'action', label: 'Assign to Agent' }
      ]);
    }
    setActiveTab('builder');
  };

  const renderBuilder = () => (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Sidebar: Components */}
        <div className="lg:col-span-1 bg-onyx-950/50 rounded-md p-4 border border-onyx-accent/20">
          <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Components</h3>
          <div className="space-y-3">
            <button
              onClick={() => addNode('action')}
              className="w-full text-left px-3 py-2 bg-onyx-950 hover:bg-onyx-accent/10 border border-onyx-accent/20 rounded-md text-sm text-slate-300 flex items-center transition-colors"
            >
              <div className="w-6 h-6 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center mr-3">
                <SafeIcon icon={FiSettings} size={14} />
              </div>
              API Action
            </button>
            <button
              onClick={() => addNode('condition')}
              className="w-full text-left px-3 py-2 bg-onyx-950 hover:bg-onyx-accent/10 border border-onyx-accent/20 rounded-md text-sm text-slate-300 flex items-center transition-colors"
            >
              <div className="w-6 h-6 rounded bg-yellow-500/20 text-yellow-400 flex items-center justify-center mr-3">
                <SafeIcon icon={FiGitMerge} size={14} />
              </div>
              Condition
            </button>
          </div>
        </div>

        {/* Right Area: Linear Representation */}
        <div className="lg:col-span-3 bg-onyx-950 rounded-md border border-onyx-accent/20 p-6 min-h-[400px]">
          <div className="text-center mb-8">
            <p className="text-sm text-slate-500">Drag and drop to reorder nodes. Triggers must remain at the top.</p>
          </div>

          <div className="max-w-md mx-auto space-y-4">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={nodes.map(n => n.id)}
                strategy={verticalListSortingStrategy}
              >
                {nodes.map((node, index) => (
                  <SortableNode
                    key={node.id}
                    node={node}
                    index={index}
                    isLast={index === nodes.length - 1}
                    onRemove={removeNode}
                  />
                ))}
              </SortableContext>
            </DndContext>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex justify-center mt-6"
            >
              <button
                onClick={() => addNode('action')}
                className="w-10 h-10 rounded-full bg-onyx-950 hover:bg-indigo-600 border border-onyx-accent/20 hover:border-indigo-500 flex items-center justify-center text-slate-400 hover:text-white transition-all shadow-lg"
              >
                <SafeIcon icon={FiPlus} size={20} />
              </button>
            </motion.div>
          </div>
        </div>
      </div>
  );

  const loadCustomWorkflow = (workflow) => {
    if (workflow.definition && workflow.definition.steps) {
      const loadedNodes = workflow.definition.steps.map((step, idx) => ({
        id: `node_${Date.now()}_${idx}`,
        type: step.type === 'trigger' ? 'trigger' : (step.type === 'api_call' ? 'action' : 'condition'),
        label: step.name
      }));
      if (loadedNodes.length > 0) {
        setNodes(loadedNodes);
        setActiveTab('builder');
        toast.success(`Loaded workflow: ${workflow.name}`);
      } else {
        toast.error("Workflow definition is empty or invalid.");
      }
    } else {
      toast.error("Workflow definition is empty or invalid.");
    }
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
                  const steps = nodes.map((node, index) => {
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
                await api.createWorkflow(
                    "Custom Workflow " + Date.now(),
                    "Generated workflow",
                    "custom_wf_" + Date.now(),
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