import { createCommand } from './commandFactory';
import api from '../api';

const queryDatabaseCommand = createCommand({
    name: 'database',
    description: 'Execute a SQL query against the database.',
    aliases: ['db', 'query'],
    keywords: ['database', 'query', 'sql'],
    usage: 'database <sql_query>',
    category: 'Database',
    args: [{ name: 'query', type: 'string', required: true, description: 'The SQL query to execute.' }],
    execute: async (args, context) => {
    const { query } = args;
    const lowerCaseQuery = query.toLowerCase();
    const isDestructive = lowerCaseQuery.includes('delete') || lowerCaseQuery.includes('update') || lowerCaseQuery.includes('insert');

    if (isDestructive) {
      const confirmation = await context.aximCore.confirm('This is a destructive query. Are you sure you want to proceed?');
      if (!confirmation) {
        return 'Query cancelled.';
      }
    }

    try {
      const results = await api.supabase.rpc('safe_sql_executor', { query });

      if (results.data.error) {
        throw new Error(results.data.error);
      }

      if (!results.data || results.data.length === 0) {
        return 'No results found.';
      }

      return {
        type: 'table',
        data: results.data,
      };
    } catch (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }
  },
});

export default [queryDatabaseCommand];
