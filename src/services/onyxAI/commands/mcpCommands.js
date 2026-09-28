import { mcpCommands as mcpActions } from './mcpCommandsActions';

export default [
  {
    id: 'mcp_call',
    name: 'mcp_call',
    keywords: ['@mcp', 'call_mcp', 'mcp'],
    aliases: ['mcp_invoke'],
    description: 'Executes a command on a connected MCP server',
    entities: [
      { name: 'server_name', example: 'screpy', required: true },
      { name: 'tool_name', example: 'get_crawl_summary', required: true },
      { name: 'args_json', example: '{"url": "https://axim.us.com"}', required: false }
    ],
    execute: mcpActions['mcp:call']
  }
];
