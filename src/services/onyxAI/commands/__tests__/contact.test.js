import { describe, it, expect, vi, beforeEach } from 'vitest';
import commands from '../contactCommands';
import api from '../../api';
import { getCrmService } from '../../../crm';
import { CommandValidationError } from '../../errors';
import { parseDate } from '../../utils';

// Mock dependencies
vi.mock('../../api');
vi.mock('../../../crm');
vi.mock('../../utils');

describe('OnyxAI Contact Commands', () => {

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('addContact', () => {
    const command = commands.find(c => c.name === 'addContact');

    it('should throw a validation error if name or email is missing', () => {
      expect(() => command.parse('add contact Test')).toThrow(CommandValidationError);
    });

    it('should pass validation if all required args are present', () => {
      const parsed = command.parse('add contact Test test@example.com');
      expect(() => command.validate(parsed)).not.toThrow();
    });

    it('should call api.addContact and return a success message', async () => {
      const args = { CONTACT_NAME: 'Test User', EMAIL: 'test@example.com' };
      api.addContact.mockResolvedValue({});
      const result = await command.execute(args, { userId: 'test-user' });
      expect(api.addContact).toHaveBeenCalledWith(args.CONTACT_NAME, args.EMAIL, 'command_hub', 'test-user');
      expect(result).toContain('successfully added');
    });
  });

  describe('updateContact', () => {
    const command = commands.find(c => c.name === 'updateContact');

    it('should throw a validation error if email is missing', () => {
      expect(() => command.validate({})).toThrow('Missing required argument: "EMAIL"');
    });

    it('should call api.updateContact and return a success message', async () => {
      const args = { EMAIL: 'test@example.com', updates: { name: 'New Name', source: 'manual' } };
      api.updateContact.mockResolvedValue({});
      const result = await command.execute(args, { userId: 'test-user' });
      expect(api.updateContact).toHaveBeenCalledWith(args.EMAIL, args.updates, 'test-user');
      expect(result).toContain('successfully updated');
      expect(result).toContain('Fields changed: name, source');
    });
  });

  describe('deleteContact', () => {
    const command = commands.find(c => c.name === 'deleteContact');

     it('should throw a validation error if email is missing', () => {
      expect(() => command.validate({})).toThrow('Missing required argument: "EMAIL"');
    });

    it('should call api.deleteContact and return a success message', async () => {
      const args = { EMAIL: 'test@example.com' };
      api.deleteContact.mockResolvedValue({});
      const result = await command.execute(args, { userId: 'test-user' });
      expect(api.deleteContact).toHaveBeenCalledWith(args.EMAIL, 'test-user');
      expect(result).toContain('successfully deleted');
    });
  });

  describe('syncCrm', () => {
    const command = commands.find(c => c.name === 'syncCrm');

    it('should throw an error if no active CRM integration is found', async () => {
      api.listAPIIntegrations.mockResolvedValue([{ type: 'llm', status: 'active' }]);
      await expect(command.execute()).rejects.toThrow('No active CRM integration found');
    });
  });

  describe('queryDatabase', () => {
    const command = commands.find(c => c.name === 'queryDatabase');

    it('should call api.queryDatabase and return formatted results', async () => {
      const term = 'John';
      const mockData = [{ name: 'John Doe', email: 'john@example.com', source: 'manual' }];
      api.queryDatabase.mockResolvedValue(mockData);
      const result = await command.execute(term, { userId: 'test-user' });
      expect(api.queryDatabase).toHaveBeenCalledWith(term, 'test-user');
      expect(result).toContain('Found 1 contact(s)');
    });
  });

  describe('listContacts', () => {
    const listContactsCommand = commands.find(c => c.name === 'listContacts');

    it('should call api.listAllContacts with default options', async () => {
      await listContactsCommand.execute(listContactsCommand.parse('list contacts'), { userId: 'test-user' });
      expect(api.listAllContacts).toHaveBeenCalledWith({
        sortBy: 'name',
        sortOrder: 'asc',
        filters: [],
      }, 'test-user');
    });

    it('should correctly parse a single filter', () => {
      const options = listContactsCommand.parse('list contacts where name contains John');
      expect(options.filters).toEqual([
        { field: 'name', operator: 'contains', value: 'John' },
      ]);
    });

    it('should correctly parse multiple filters', () => {
      const options = listContactsCommand.parse('list contacts where name contains John and source is csv_import');
      expect(options.filters).toEqual([
        { field: 'name', operator: 'contains', value: 'John' },
        { field: 'source', operator: 'is', value: 'csv_import' },
      ]);
    });

    it('should correctly parse multiple filters with quoted values', () => {
        const options = listContactsCommand.parse('list contacts where name = "John Doe" and source is web');
        expect(options.filters).toEqual([
            { field: 'name', operator: '=', value: 'John Doe' },
            { field: 'source', operator: 'is', value: 'web' },
        ]);
    });

    it('should correctly parse filters with quoted values', () => {
      const options = listContactsCommand.parse('list contacts where name = "John Doe"');
      expect(options.filters).toEqual([
        { field: 'name', operator: '=', value: 'John Doe' },
      ]);
    });

    it('should correctly parse sorting options', () => {
      const options = listContactsCommand.parse('list contacts sort by name asc');
      expect(options.sortBy).toBe('name');
      expect(options.sortOrder).toBe('asc');
    });

    it('should parse both sorting and filtering', () => {
      const options = listContactsCommand.parse('list contacts where source is web sort by email');
      expect(options.filters).toEqual([
        { field: 'source', operator: 'is', value: 'web' },
      ]);
      expect(options.sortBy).toBe('email');
      expect(options.sortOrder).toBe('asc'); // Default
    });

    it('should call api.listAllContacts and return formatted results', async () => {
        const mockData = [{ name: 'Jane Doe', email: 'jane@example.com', source: 'manual' }];
        api.listAllContacts.mockResolvedValue(mockData);
        const result = await listContactsCommand.execute({}, { userId: 'test-user' }); // Pass empty options object
        expect(api.listAllContacts).toHaveBeenCalled();
        expect(result).toContain('Found 1 contact(s)');
    });
  });
});

describe('listContacts Parser Edge Cases', () => {
  const listContactsCommand = commands.find(c => c.name === 'listContacts');

  beforeEach(() => {
    vi.mocked(parseDate).mockClear();
  });

  it('should correctly parse a "since" date filter', () => {
    vi.mocked(parseDate).mockReturnValue({ startDate: '2023-01-15T00:00:00.000Z', endDate: null });
    const options = listContactsCommand.parse('list contacts where created_at since "Jan 15 2023"');
    expect(options.filters[0].operator).toBe('since');
    expect(options.filters[0].value.startDate).toBe('2023-01-15T00:00:00.000Z');
  });

  it('should correctly parse a "before" date filter', () => {
    vi.mocked(parseDate).mockReturnValue({ startDate: null, endDate: '2024-01-01T00:00:00.000Z' });
    const options = listContactsCommand.parse('list contacts where created_at before "2024"');
    expect(options.filters[0].operator).toBe('before');
    expect(options.filters[0].value.endDate).toBe('2024-01-01T00:00:00.000Z');
  });

  it('should handle a mix of date and text filters', () => {
    vi.mocked(parseDate).mockReturnValue({ startDate: '2023-01-01T00:00:00.000Z', endDate: null });
    const options = listContactsCommand.parse('list contacts where source is "web" and created_at since "last year"');
    expect(options.filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'source', operator: 'is', value: 'web' }),
        expect.objectContaining({ field: 'created_at', operator: 'since' }),
      ])
    );
  });
});
