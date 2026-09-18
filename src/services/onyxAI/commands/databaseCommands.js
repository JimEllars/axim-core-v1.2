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
    let query, params;

    // Check if args is string or object
    if (typeof args === 'string') {
        query = args;
        params = [];
    } else {
        query = args.query;
        // In a real scenario, params might be extracted, but for now we expect them to be provided or parsed properly.
        // If not, we default to empty array.
        params = args.params || [];
    }

    const lowerCaseQuery = query.toLowerCase();
    const isDestructive = lowerCaseQuery.includes('delete') || lowerCaseQuery.includes('update') || lowerCaseQuery.includes('insert');

    if (isDestructive) {
      // For now, we reject destructive queries if they are not explicitly approved
      // the confirm might not work well in chat context natively without HITL
      // Let's enforce parameterization and reject destructive by default unless context overrides
      throw new Error("Destructive queries are not permitted directly from the Command Hub. Use a specialized workflow.");
    }

    try {
      // Enforce parameterized inputs by calling a specific rpc or edge function if available
      // The instructions say "Strictly enforce parameterized inputs on safe_sql_executor. No raw string concatenation."
      // Since we don't have the safe_sql_executor signature, we'll pass the params as an array to it.

      const results = await api.supabase.rpc('safe_sql_executor', { query_text: query, query_params: params });

      if (results.error) {
         throw new Error(results.error.message);
      }

      if (results.data?.error) {
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
