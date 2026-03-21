// src/services/onyxAI/commands/networkCommands.js
import { createCommand } from './commandFactory.js';
import { CommandValidationError } from '../errors';
import { toast } from 'react-hot-toast';
import ApiService from '../api.js';
import { formatDistanceToNow } from 'date-fns';

const pingCommand = createCommand({
  name: 'ping',
  description: 'Sends a health check to a specified URL.',
  category: 'Network',
  keywords: ['ping', 'health', 'check', 'network'],
  usage: 'ping <url>',
  aliases: ['health-check'],
  validate: (args) => {
    if (args.length !== 1) {
      throw new CommandValidationError('You must provide a single URL to ping.');
    }
    try {
      new URL(args[0]);
    } catch (e) {
      throw new CommandValidationError('The provided URL is invalid.');
    }
    return true;
  },
  execute: async (args, context) => {
    const url = args[0];
    const toastId = toast.loading(`Pinging ${url}...`);

    try {
      // In a real Electron app, this would be an IPC call to the main process
      // which can make a real network request.
      const isReachable = await window.electronAPI.pingHost(url);

      if (isReachable) {
        toast.success(`Successfully reached ${url}.`, { id: toastId });
        return `Host ${url} is reachable.`;
      } else {
        toast.error(`Could not reach ${url}.`, { id: toastId });
        return `Host ${url} is unreachable.`;
      }
    } catch (error) {
      toast.error(`Error while pinging ${url}: ${error.message}`, { id: toastId });
      return `Error: ${error.message}`;
    }
  },
});

const listDevicesCommand = createCommand({
  name: 'list devices',
  description: 'Lists all registered devices for your account.',
  category: 'Network',
  keywords: ['list', 'devices', 'network', 'machines'],
  usage: 'list devices',
  aliases: ['ls devices', 'show devices'],

  execute: async (args, context) => {
    try {
      const devices = await ApiService.listDevices(context.userId);

      if (!devices || devices.length === 0) {
        return 'No devices are registered to your account.';
      }

      const deviceList = devices.map(device => {
        const lastSeen = device.last_seen
          ? `${formatDistanceToNow(new Date(device.last_seen))} ago`
          : 'never';

        return `- **${device.device_name}** (Status: ${device.status}, Last Seen: ${lastSeen})`;
      }).join('\\n');

      return `**Registered Devices:**\\n${deviceList}`;
    } catch (error) {
      toast.error(`Failed to list devices: ${error.message}`);
      return `Error: Could not retrieve the device list.`;
    }
  },
});

export default [pingCommand, listDevicesCommand];
