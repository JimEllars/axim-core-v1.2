import { callTool } from '../../mcp/mcpClient';
import serviceRegistry from '../serviceRegistry';
import logger from '../../logging';

export const mcpCommands = {
  'mcp:call': async (context, args) => {
    try {
      if (typeof args === 'string') {
        args = args.trim().split(/\s+/);
      }

      if (!args || args.length < 2) {
         return {
             status: 'error',
             message: 'Usage: @mcp <server_name> <tool_name> [args_json]'
         };
      }

      const serverName = args[0];
      const toolName = args[1];

      let toolArgs = {};
      if (args.length > 2) {
          try {
              const argString = args.slice(2).join(' ');
              toolArgs = JSON.parse(argString);
          } catch(e) {
              return {
                 status: 'error',
                 message: 'Invalid arguments format. Must be valid JSON.'
              };
          }
      }

      const registryKey = `mcp:${serverName}:${toolName}`.toLowerCase().replace(/\s+/g, '-');
      const toolDefinition = serviceRegistry.getService(registryKey);

      if (!toolDefinition || toolDefinition.type !== 'mcp_tool') {
        return {
          status: 'error',
          message: `Tool ${toolName} on server ${serverName} is not registered or is not an MCP tool.`
        };
      }

      logger.info(`Executing MCP tool ${toolName} on ${serverName}`);
      const result = await callTool(
         toolDefinition.endpoint,
         toolDefinition.serverToken,
         toolName,
         toolArgs
      );

      return {
        status: 'success',
        result,
        message: `Successfully executed ${toolName} on ${serverName}`
      };

    } catch (error) {
      logger.error(`MCP Command Error: ${error.message}`);
      return {
        status: 'error',
        message: `Failed to execute MCP tool: ${error.message}`
      };
    }
  }
};
