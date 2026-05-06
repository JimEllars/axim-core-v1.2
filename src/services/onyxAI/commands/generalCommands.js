import { createCommand } from './commandFactory';
import { getOS } from '@/utils/osDetection';
import { supabase } from '../../supabaseClient.js';

const getInstallCommand = createCommand({
  name: 'getInstallCommand',
  description: 'Provides installation instructions for the AXiM Core application.',
  keywords: ['install', 'get', 'command', 'setup'],
  aliases: ['install-instructions'],
  usage: 'get install command',
  category: 'System',
  execute: async () => {
    const os = getOS();

    if (os === 'Windows') {
      return 'Download the .exe installer from the releases page.';
    } else if (os === 'macOS') {
      return 'Download the .dmg installer from the releases page.';
    } else if (os === 'Linux') {
      return 'Download the .AppImage from the releases page and run `chmod +x AXiM-Core-X.Y.Z.AppImage`.';
    } else {
      return `Could not determine your OS (Detected: ${os}). Please visit the releases page to download the installer.`;
    }
  },
});

const delegateToDepartmentCommand = createCommand({
  name: 'delegateToDepartmentCommand',
  description: 'Delegates highly specialized domain queries to specific C-Suite Chatbase sub-agents.',
  keywords: ['delegate', 'ask', 'consult', 'department'],
  aliases: ['delegate_to_department'],
  usage: 'delegate to department [Department Name] [Query]',
  category: 'General',
  execute: async (args, context) => {
    const [departmentMatch, queryMatch] = args.match(/^(?:to\s+department\s+)?([A-Za-z]+)\s+(.+)$/i) || [null, args.split(' ')[0], args.split(' ').slice(1).join(' ')];

    let department = departmentMatch;
    let query = queryMatch;

    if (args && args.department && args.query) {
        department = args.department;
        query = args.query;
    } else if (!departmentMatch) {
       department = args.split(' ')[0];
       query = args.split(' ').slice(1).join(' ');
    }

    if (!department || !query) {
      return "I need to know which department (e.g., Legal, CEO) and what query to send.";
    }

    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    department = capitalize(department);

    const validDepartments = ['CEO', 'CTO', 'CFO', 'COO', 'Legal'];
    const deptAliasMap = {
        'Law': 'Legal',
        'Lawyer': 'Legal',
        'Chief executive': 'CEO',
        'Chief technology': 'CTO',
        'Chief financial': 'CFO',
        'Chief operating': 'COO'
    };

    department = deptAliasMap[department] || department;

    if (!validDepartments.includes(department)) {
      department = department.toUpperCase(); // check acronyms
    }

    if (!validDepartments.includes(department)) {
      return `Department '${department}' not recognized. Valid departments are: ${validDepartments.join(', ')}`;
    }

    try {
      // Proxy via our chatbase-sync edge function
      const { data, error } = await supabase.functions.invoke('chatbase-sync', {
        body: {
          agent: department,
          query: query
        }
      });

      if (error) throw error;

      if (data && data.response) {
        // Return structured format so the frontend can append it to Onyx context or display it.
        return `[Delegate Response from ${department} Agent]: ${data.response}\n\n[Onyx Synthesis]: Based on the response from the ${department} department, ${data.response}`;
      } else {
          return `The ${department} department did not provide a valid response.`;
      }
    } catch (error) {
      console.error(`Delegation error for ${department}:`, error);
      return `Failed to consult the ${department} department: ${error.message}`;
    }
  },
});

export default [getInstallCommand, delegateToDepartmentCommand];
