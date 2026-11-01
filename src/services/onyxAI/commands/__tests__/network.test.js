// src/services/onyxAI/commands/__tests__/network.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import networkCommands from '../networkCommands';
import ApiService from '../../api';

vi.mock('../../api');

describe('OnyxAI Network Commands', () => {
  describe('list devices', () => {
    const command = networkCommands.find(c => c.name === 'list devices');

    beforeEach(() => {
      vi.resetAllMocks();
    });

    it('should return a formatted list of registered devices', async () => {
      const mockDevices = [
        { device_name: 'Desktop-Main', status: 'online', last_seen: new Date().toISOString() },
        // 26 hours, not 24: date-fns v4 floors the hour count in its `xHours`
        // branch, so exactly 86400000ms renders as "about 23 hours ago" and only
        // 24h+36h renders as "1 day". The old value asserted a string that
        // production never produces, so this test was red on main.
        { device_name: 'Laptop-Travel', status: 'offline', last_seen: new Date(Date.now() - 26 * 3600 * 1000).toISOString() }, // 1 day ago
      ];
      ApiService.listDevices.mockResolvedValue(mockDevices);

      const response = await command.execute({}, { userId: 'test-user' });

      expect(ApiService.listDevices).toHaveBeenCalledWith('test-user');
      expect(response).toContain('**Registered Devices:**');
      expect(response).toContain('- **Desktop-Main** (Status: online, Last Seen: less than a minute ago)');
      expect(response).toContain('- **Laptop-Travel** (Status: offline, Last Seen: 1 day ago)');
    });

    it('should return a message if no devices are registered', async () => {
      ApiService.listDevices.mockResolvedValue([]);

      const response = await command.execute({}, { userId: 'test-user' });

      expect(ApiService.listDevices).toHaveBeenCalledWith('test-user');
      expect(response).toBe('No devices are registered to your account.');
    });

    it('should return an error message if the API call fails', async () => {
      ApiService.listDevices.mockRejectedValue(new Error('Internal Server Error'));

      const response = await command.execute({}, { userId: 'test-user' });

      expect(ApiService.listDevices).toHaveBeenCalledWith('test-user');
      expect(response).toBe('Error: Could not retrieve the device list.');
    });
  });
});
