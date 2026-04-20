import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import supabaseApiService from '../supabaseApiService';
import { DatabaseError, CommandExecutionError } from '../onyxAI/errors';

import logger from '../logging';

// Mock toast notifications
vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Create mutable mocks that can be controlled by each test
const mockConnectivityManager = {
  getIsOnline: vi.fn(() => true),
};

const mockOfflineManager = {
  queueRequest: vi.fn(),
};

const mockSupabase = {
    from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({}),
    })),
    rpc: vi.fn(),
    auth: {
        admin: {
            inviteUserByEmail: vi.fn(),
        },
    },
};

describe('SupabaseApiService', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();

    // Spy on logger to suppress output
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'debug').mockImplementation(() => {});

    // Use the new dependency injection initialization
    supabaseApiService.initialize(mockSupabase, mockConnectivityManager, mockOfflineManager);
    mockConnectivityManager.getIsOnline.mockReturnValue(true);
    // Suppress console.error during expected error tests
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
  });


  describe('getSystemStats', () => {
    it('should return system stats on success', async () => {
      const from = vi.fn(table => {
        let count = 0;
        if (table === 'contacts_ax2024') count = 10;
        if (table === 'events_ax2024') count = 20;
        if (table === 'api_integrations_ax2024') count = 5;
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ count, error: null }),
        };
      });
      mockSupabase.from = from;

      const stats = await supabaseApiService.getSystemStats('test-user-id');
      expect(stats).toEqual({ totalContacts: 10, totalEvents: 20, totalAPIs: 5 });
    });


    it('should throw DatabaseError on failure', async () => {
      const from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ count: null, error: { message: 'DB error' } }),
      });
      mockSupabase.from = from;
      await expect(supabaseApiService.getSystemStats('test-user-id')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getAPIStats', () => {
    it('should return API stats on success', async () => {
      const mockIntegrations = [{ id: 1, name: 'Test API' }];
      const mockLogs = [{ success: true }, { success: false }];

      const from = vi.fn(table => {
        if (table === 'api_integrations_ax2024') {
          return {
            select: vi.fn().mockResolvedValue({ data: mockIntegrations, error: null }),
          };
        }
        if (table === 'api_call_logs_ax2024') {
          return {
            select: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: mockLogs, error: null }),
          };
        }
        return { select: vi.fn().mockReturnThis(), limit: vi.fn() };
      });
      mockSupabase.from = from;

      const stats = await supabaseApiService.getAPIStats();
      expect(stats).toEqual({ integrations: mockIntegrations, logs: mockLogs });
    });

    it('should throw DatabaseError on rpc failure', async () => {
      const from = vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB Error' } }),
      });
      mockSupabase.from = from;
      await expect(supabaseApiService.getAPIStats()).rejects.toThrow(DatabaseError);
    });
  });

  describe('queryDatabase', () => {
    it('should return matched data on success', async () => {
      const mockData = [{ name: 'Test Contact', email: 'test@example.com' }];
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await supabaseApiService.queryDatabase('test', 'user-1');

      expect(result).toEqual(mockData);
      expect(mockSupabase.from).toHaveBeenCalledWith('contacts_ax2024');
      expect(mockQuery.select).toHaveBeenCalledWith('name, email, source, created_at');
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(mockQuery.or).toHaveBeenCalledWith('name.ilike.%test%,email.ilike.%test%');
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
    });

    it('should throw DatabaseError on query failure', async () => {
      const mockError = { message: 'DB Query Failed' };
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: null, error: mockError }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      await expect(supabaseApiService.queryDatabase('test', 'user-1')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getProjectByName', () => {
    it('should return project on success', async () => {
      const mockProject = { id: 1, name: 'Test Project' };
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      const project = await supabaseApiService.getProjectByName('Test Project');

      expect(project).toEqual(mockProject);
      expect(mockQuery.eq).toHaveBeenCalledWith('name', 'Test Project');
    });

    it('should throw CommandExecutionError if project not found', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      await expect(supabaseApiService.getProjectByName('Nonexistent')).rejects.toThrow(
        new CommandExecutionError('Project with name "Nonexistent" not found.')
      );
    });
  });

  describe('addContact', () => {
    it('should add a contact and log an event on success', async () => {
      const mockContact = { id: 1, name: 'John Doe', email: 'john@example.com' };
      const mockInsert = vi.fn().mockReturnThis();
      const mockQuery = {
        insert: mockInsert,
        select: vi.fn().mockResolvedValue({ data: [mockContact], error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await supabaseApiService.addContact('John Doe', 'john@example.com', 'test', 'user-1');

      expect(result).toEqual([mockContact]); // Changed to expect an array
      expect(mockSupabase.from).toHaveBeenCalledWith('contacts_ax2024');
      expect(mockInsert).toHaveBeenCalledWith({ name: 'John Doe', email: 'john@example.com', source: 'test', user_id: 'user-1' });
    });

    it('should throw CommandExecutionError for duplicate contact', async () => {
      const mockQuery = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate' } }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      // Updated to match the exact, more specific error message from the implementation
      await expect(supabaseApiService.addContact('jane@example.com', 'jane@example.com', 'test', 'user-1')).rejects.toThrow(
        new CommandExecutionError('Contact with email "jane@example.com" already exists.')
      );
    });


    it('should reject if userId is not provided', async () => {
        await expect(supabaseApiService.addContact('Test', 'test@test.com')).rejects.toThrow(
            new CommandExecutionError('A user ID must be provided to create a contact.')
        );
    });
  });

  describe('deleteContact', () => {
    it('should delete a contact on success', async () => {
      const mockDeletedContact = { id: 1, email: 'test@example.com' };
      const mockSelect = vi.fn().mockResolvedValue({ data: [mockDeletedContact], error: null });
      const mockEq = vi.fn().mockReturnThis();

      const mockQuery = {
        delete: vi.fn().mockReturnThis(),
        eq: mockEq,
        select: mockSelect,
      };
      // For delete, the chain is `delete().eq().select()`, so eq must return the object with select
      mockEq.mockReturnValue({ select: mockSelect });

      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await supabaseApiService.deleteContact('test@example.com');

      expect(result).toEqual([mockDeletedContact]);
      expect(mockEq).toHaveBeenCalledWith('email', 'test@example.com');
    });

    it('should throw CommandExecutionError if contact not found', async () => {
      const mockSelect = vi.fn().mockResolvedValue({ data: [], error: null });
      const mockEq = vi.fn().mockReturnThis();
      const mockQuery = {
        delete: vi.fn().mockReturnThis(),
        eq: mockEq,
        select: mockSelect,
      };
      mockEq.mockReturnValue({ select: mockSelect });
      mockSupabase.from.mockReturnValue(mockQuery);

      await expect(supabaseApiService.deleteContact('notfound@example.com')).rejects.toThrow(
        new CommandExecutionError('Contact with email "notfound@example.com" not found.')
      );
    });
  });


  describe('getChatHistoryForUser', () => {
    it('should return chat history on success', async () => {
        const mockHistory = [{ command: 'help', response: 'Help message', status: 'success' }];
        const mockQuery = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: mockHistory, error: null }),
        };
        mockSupabase.from.mockReturnValue(mockQuery);

        const history = await supabaseApiService.getChatHistoryForUser('user-1', 'convo-1');
        expect(history).toEqual(mockHistory);
        expect(mockQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
        expect(mockQuery.eq).toHaveBeenCalledWith('conversation_id', 'convo-1');
    });

    it('should return empty array on database error', async () => {
        const mockQuery = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: null, error: new Error('DB Error') }),
        };
        mockSupabase.from.mockReturnValue(mockQuery);

        const history = await supabaseApiService.getChatHistoryForUser('user-1', 'convo-1');
        expect(history).toEqual([]);
    });
  });


  describe('createTaskForProject', () => {
    it('should create a task for a project', async () => {
      const mockProject = { id: 'project-1', name: 'Test Project' };
      const mockTask = { id: 'task-1', title: 'New Task', project_id: 'project-1' };
      vi.spyOn(supabaseApiService, 'getProjectByName').mockResolvedValue(mockProject);
      const mockQuery = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockTask, error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      const task = await supabaseApiService.createTaskForProject('New Task', 'Test Project', 'user-1');

      expect(task).toEqual(mockTask);
      expect(mockQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
        project_id: 'project-1',
        user_id: 'user-1',
      }));
    });
  });

  describe('assignTaskToContact', () => {
    it('should assign a task to a contact', async () => {
      const mockTask = { id: 'task-1' };
      const mockContact = { id: 'contact-1' };
      vi.spyOn(supabaseApiService, 'getTaskByTitle').mockResolvedValue(mockTask);
      vi.spyOn(supabaseApiService, 'getContactByEmail').mockResolvedValue(mockContact);
      const mockQuery = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { ...mockTask, contact_id: mockContact.id }, error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      await supabaseApiService.assignTaskToContact('Test Task', 'test@example.com');

      expect(mockQuery.update).toHaveBeenCalledWith({ contact_id: 'contact-1' });
      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'task-1');
    });
  });

  describe('logEvent', () => {
    it('should log an event', async () => {
      const mockQuery = {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      await supabaseApiService.logEvent('test_event', { foo: 'bar' }, 'user-1');

      expect(mockQuery.insert).toHaveBeenCalledWith({
        type: 'test_event',
        data: { foo: 'bar' },
        user_id: 'user-1',
      });
    });
  });

  describe('bulkDeleteContacts', () => {
    it('should delete contacts in bulk', async () => {
      const emails = ['a@a.com', 'b@b.com'];
      const mockQuery = {
        delete: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ count: 2, error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await supabaseApiService.bulkDeleteContacts(emails);

      expect(result.count).toBe(2);
      expect(mockQuery.in).toHaveBeenCalledWith('email', emails);
    });

    it('should return count 0 if no emails provided', async () => {
        const result = await supabaseApiService.bulkDeleteContacts([]);
        expect(result.count).toBe(0);
        expect(mockSupabase.from).not.toHaveBeenCalled();
    });
  });

  describe('listAllContacts', () => {
    it('should list all contacts with default sorting', async () => {
      const mockContacts = [{ name: 'Alice' }, { name: 'Bob' }];
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockContacts, error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      const contacts = await supabaseApiService.listAllContacts({}, 'user-1');

      expect(contacts).toEqual(mockContacts);
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(mockQuery.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('should handle custom sorting and filtering', async () => {
      const mockContacts = [{ name: 'Charlie', source: 'web' }];
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockContacts, error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      const options = {
        sortBy: 'source',
        sortOrder: 'desc',
        filters: [{ field: 'name', operator: 'contains', value: 'Charlie' }],
      };
      const contacts = await supabaseApiService.listAllContacts(options, 'user-1');

      expect(contacts).toEqual(mockContacts);
      expect(mockQuery.ilike).toHaveBeenCalledWith('name', '%Charlie%');
      expect(mockQuery.order).toHaveBeenCalledWith('source', { ascending: false });
    });

    it('should throw DatabaseError on failure', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB Error' } }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      await expect(supabaseApiService.listAllContacts({}, 'user-1')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getUserProfile', () => {
    it('should retrieve a user profile', async () => {
      const mockProfile = { id: 'user-1', full_name: 'Test User' };
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      const profile = await supabaseApiService.getUserProfile('user-1');
      expect(profile).toEqual(mockProfile);
      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'user-1');
    });

    it('should return null if profile not found', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);
      const profile = await supabaseApiService.getUserProfile('user-not-found');
      expect(profile).toBeNull();
    });
  });

  describe('getUsers', () => {
    it('should retrieve a list of users', async () => {
      const mockUsers = [{ id: 'user-1', email: 'user@test.com' }];
      mockSupabase.rpc.mockResolvedValue({ data: mockUsers, error: null });

      const users = await supabaseApiService.getUsers();
      expect(users).toEqual(mockUsers);
      // Corrected the RPC name to match the implementation
      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_all_users');
    });

    it('should throw DatabaseError on rpc failure', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'RPC Error' } });
      await expect(supabaseApiService.getUsers()).rejects.toThrow(DatabaseError);
    });
  });


  describe('updateUserProfile', () => {
    it('should update a user profile', async () => {
      const updatedProfile = { id: 'user-1', full_name: 'Updated Name' };
      const mockQuery = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: updatedProfile, error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      const profile = await supabaseApiService.updateUserProfile('user-1', { full_name: 'Updated Name' });
      expect(profile).toEqual(updatedProfile);
      expect(mockQuery.update).toHaveBeenCalledWith({ full_name: 'Updated Name' });
      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'user-1');
    });
  });

  describe('deleteDevice', () => {
    it('should delete a device on success', async () => {
      const mockQuery = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      await supabaseApiService.deleteDevice('device-1');

      expect(mockSupabase.from).toHaveBeenCalledWith('devices');
      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'device-1');
    });

    it('should throw DatabaseError on failure', async () => {
      const mockQuery = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: { message: 'DB Error' } }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      await expect(supabaseApiService.deleteDevice('device-1')).rejects.toThrow(DatabaseError);
    });
  });

  describe('Offline Behavior', () => {
    beforeEach(() => {
      mockConnectivityManager.getIsOnline.mockReturnValue(false);
    });

    // The implementation now returns a resolved promise for offline write operations.
    it('should queue a write operation when offline and resolve', async () => {
      await expect(supabaseApiService.addContact('Offline User', 'offline@test.com', 'test', 'user-1')).resolves.toBeUndefined();
      // addContact now accepts a 5th argument 'id' which defaults to null
      expect(mockOfflineManager.queueRequest).toHaveBeenCalledWith('addContact', ['Offline User', 'offline@test.com', 'test', 'user-1', null]);
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });


    it('should throw CommandExecutionError for a read operation when offline', async () => {
      // Corrected the error message to match the implementation
      await expect(supabaseApiService.listAllContacts({}, 'user-1')).rejects.toThrow(
        'The application is offline. This action is currently unavailable.'
      );
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    // logAIInteraction is a special case and is designed to be dropped when offline.
    it('should NOT queue logAIInteraction when offline', async () => {
      await supabaseApiService.logAIInteraction('test command', {}, 100, 'success', 'user-1', 'convo-1');
      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(mockOfflineManager.queueRequest).not.toHaveBeenCalled();
    });
  });

  describe('updateContact', () => {
    it('should update a contact on success', async () => {
      const mockUpdatedContact = { id: 1, name: 'Jane Doe' };
      const mockSelect = vi.fn().mockResolvedValue({ data: [mockUpdatedContact], error: null });
      const mockEq = vi.fn().mockReturnThis();
      const mockQuery = {
        update: vi.fn().mockReturnThis(),
        eq: mockEq,
        select: mockSelect,
      };
      mockEq.mockReturnValue({ select: mockSelect });
      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await supabaseApiService.updateContact('jane@example.com', { name: 'Jane Doe' });

      expect(result).toEqual([mockUpdatedContact]); // Changed to expect an array
      expect(mockQuery.update).toHaveBeenCalledWith({ name: 'Jane Doe' });
      expect(mockEq).toHaveBeenCalledWith('email', 'jane@example.com');
    });

    it('should throw CommandExecutionError if contact to update is not found', async () => {
      const mockQuery = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      await expect(supabaseApiService.updateContact('notfound@example.com', { name: 'test' })).rejects.toThrow(
        new CommandExecutionError('Contact with email "notfound@example.com" not found.')
      );
    });
  });

  describe('registerDevice', () => {
    it('should register a new device successfully', async () => {
      const mockDevice = { id: 'device-1', device_name: 'Test Device' };
      const mockQuery = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockDevice, error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await supabaseApiService.registerDevice('device-1', 'Test Device', {}, 'user-1');

      expect(result).toEqual(mockDevice);
      expect(mockQuery.insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'device-1' }));
    });

    it('should call sendDeviceHeartbeat if device already exists (error code 23505)', async () => {
      const mockQuery = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: '23505' } }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);
      const heartbeatSpy = vi.spyOn(supabaseApiService, 'sendDeviceHeartbeat').mockResolvedValue({ id: 'device-1' });

      await supabaseApiService.registerDevice('device-1', 'Test Device', { info: 'test' }, 'user-1');

      expect(heartbeatSpy).toHaveBeenCalledWith('device-1', { info: 'test' });
    });
  });

  describe('Notes', () => {
    it('should create a note for a contact', async () => {
      const mockNote = { id: 'note-1', content: 'Test note' };
      const mockQuery = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockNote, error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await supabaseApiService.createNote('contact-1', 'Test note', 'user-1');

      expect(result).toEqual(mockNote);
      expect(mockQuery.insert).toHaveBeenCalledWith({
        contact_id: 'contact-1',
        content: 'Test note',
        user_id: 'user-1',
      });
    });

    it('should get notes for a contact', async () => {
      const mockNotes = [{ id: 'note-1', content: 'Test note' }];
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockNotes, error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await supabaseApiService.getNotesForContact('contact-1');

      expect(result).toEqual(mockNotes);
      expect(mockQuery.eq).toHaveBeenCalledWith('contact_id', 'contact-1');
    });

    it('should delete a note', async () => {
      const mockQuery = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      await supabaseApiService.deleteNote('note-1');

      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'note-1');
    });
  });

  describe('Device Management', () => {
    it('should list devices for a user', async () => {
      const mockDevices = [{ id: 'device-1', device_name: 'Test Device' }];
       const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockDevices, error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await supabaseApiService.listDevices('user-1');

      expect(result).toEqual(mockDevices);
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
    });

    it('should update a device', async () => {
      const mockDevice = { id: 'device-1', device_name: 'New Name' };
      const mockQuery = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockDevice, error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await supabaseApiService.updateDevice('device-1', { device_name: 'New Name' });

      expect(result).toEqual(mockDevice);
      expect(mockQuery.update).toHaveBeenCalledWith({ device_name: 'New Name' });
      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'device-1');
    });
  });

   describe('User Settings', () => {
    it('should get user settings', async () => {
      const mockSettings = { theme: 'dark' };
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { settings: mockSettings }, error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await supabaseApiService.getUserSettings('user-1');

      expect(result).toEqual(mockSettings);
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
    });

    it('should return empty object if user settings not found', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);
      const result = await supabaseApiService.getUserSettings('user-1');
      expect(result).toEqual({});
    });

    it('should save user settings', async () => {
      const mockSettings = { theme: 'dark' };
      const mockQuery = {
        upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      await supabaseApiService.saveUserSettings('user-1', mockSettings);

      expect(mockQuery.upsert).toHaveBeenCalledWith({
        user_id: 'user-1',
        settings: mockSettings,
      }, { onConflict: 'user_id' });
    });
  });

  describe('checkSystemHealth', () => {
    it('should return health status of all services', async () => {
      // Mock Supabase success
      const mockQuery = {
        select: vi.fn().mockResolvedValue({ count: 100, error: null }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      const health = await supabaseApiService.checkSystemHealth();

      expect(health.results).toHaveLength(3);
      expect(health.results[0]).toEqual(expect.objectContaining({ name: 'Supabase Database', status: '✅ Online' }));
      expect(health.results[1]).toEqual(expect.objectContaining({ name: 'Stripe Billing' }));
      expect(health.results[2]).toEqual(expect.objectContaining({ name: 'AI Agent Layer' }));
    });

    it('should report Supabase as offline on error', async () => {
      // Mock Supabase failure
      const mockQuery = {
        select: vi.fn().mockResolvedValue({ count: null, error: { message: 'Connection failed' } }),
      };
      mockSupabase.from.mockReturnValue(mockQuery);

      const health = await supabaseApiService.checkSystemHealth();

      expect(health.results[0]).toEqual(expect.objectContaining({ name: 'Supabase Database', status: '❌ Offline' }));
    });
  });

});
