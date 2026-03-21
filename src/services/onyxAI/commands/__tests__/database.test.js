import { describe, it, expect, vi } from 'vitest';
import databaseCommands from '../databaseCommands';
import api from '../../api';

// Mock the api module
vi.mock('../../api', () => {
  return {
    default: {
      supabase: {
        rpc: vi.fn(),
      },
    },
  };
});

describe('database command', () => {
  const databaseCommand = databaseCommands.find(c => c.name === 'database');

  it('should call the safe_sql_executor and return the results', async () => {
    const query = 'SELECT * FROM contacts_ax2024';
    const mockData = [{ name: 'John Doe', email: 'john@example.com' }];

    api.supabase.rpc.mockResolvedValue({ data: mockData });

    const result = await databaseCommand.execute({ query }, { aximCore: { confirm: () => true } });

    expect(api.supabase.rpc).toHaveBeenCalledWith('safe_sql_executor', { query });
    expect(result).toEqual({ type: 'table', data: mockData });
  });
});
