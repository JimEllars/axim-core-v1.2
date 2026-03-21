// src/services/onyxAI/commands/externalCommands.js
import { createCommand } from './commandFactory';
import serviceRegistry from '../serviceRegistry';

const externalCommands = [
  createCommand({
    name: 'transcribe',
    description: 'Sends an audio file to the AXiM transcription service.',
    keywords: ['transcribe', 'audio', 'speech-to-text'],
    usage: 'transcribe <file_path_or_url>',
    category: 'External',
    entities: [{ name: 'source', required: true, prompt: 'Please provide a path or URL to the audio file.' }],
    async execute({ source }, { aximCore }) {
      const service = serviceRegistry.getService('transcribe');
      if (!service) {
         return { error: "The transcription service is currently unavailable or not registered." };
      }

      // Use the centralized ApiService to call the external transcription service.
      const response = await aximCore.api.initiateTranscription(source, aximCore.userId);

      if (response.status === 'queued') {
        return {
          message: `Request to transcribe "${source}" has been queued as you are offline. It will be processed when you reconnect.`,
          status: 'queued',
          source
        };
      }

      return {
        message: `Transcription for "${source}" has been initiated.`,
        transcriptionId: response.transcriptionId,
        status: response.status || 'success'
      };
    },
  }),
  createCommand({
    name: 'assignCanvasser',
    description: 'Assigns a contact to a canvassing turf in Ground Game.',
    keywords: ['canvass', 'assign turf', 'ground game', 'assign canvasser'],
    usage: 'assign canvasser <email> to turf <turf_name>',
    category: 'External',
    entities: [
      { name: 'email', required: true, prompt: 'Which canvasser (email)?' },
      { name: 'turf', required: true, prompt: 'Which turf should they be assigned to?' }
    ],
    // Specific parser for natural language syntax
    parse: (command) => {
      // Matches: "assign canvasser john@example.com to turf Downtown"
      const emailRegex = /canvasser\s+([\w.-]+@[\w.-]+)/i;
      const turfRegex = /to\s+turf\s+(.+)/i;

      const emailMatch = command.match(emailRegex);
      const turfMatch = command.match(turfRegex);

      // If regex match fails, we return an empty object so standard entity extraction can try to fill the gaps
      if (!emailMatch && !turfMatch) return {};

      return {
        email: emailMatch ? emailMatch[1] : undefined,
        turf: turfMatch ? turfMatch[1].trim() : undefined,
      };
    },
    async execute({ email, turf }, { aximCore }) {
      // Direct API call without service registry check for now, as Ground Game is a core integration.
      const response = await aximCore.api.assignCanvasserToTurf(email, turf, aximCore.userId);

      if (response.status === 'queued') {
        return {
          message: `Request to assign "${email}" to turf "${turf}" has been queued.`,
          status: 'queued'
        };
      }

      return {
        message: `Canvasser ${email} assigned to turf ${turf}.`,
        assignmentId: response.assignmentId || 'N/A',
        turf,
        email
      };
    },
  }),
  createCommand({
    name: 'foreman',
    description: 'Interact with ForemanOS services.',
    keywords: ['foreman', 'foremanos', 'project management'],
    usage: 'foreman <action>',
    category: 'External',
    entities: [
      { name: 'action', required: true, prompt: 'What action would you like to perform? (e.g., status)' }
    ],
    async execute({ action }, { aximCore }) {
      const service = serviceRegistry.getService('foreman-os');
      if (!service) {
         return { error: "ForemanOS service is currently unavailable or not registered." };
      }

      const response = await aximCore.api.invokeAximService('foreman-os', action, {}, aximCore.userId);

      if (response.status === 'queued') {
        return {
          message: `ForemanOS action "${action}" queued.`,
          status: 'queued'
        };
      }

      // Return raw object for the UI to format nicely (e.g. as table or JSON block)
      return response;
    },
  }),
  createCommand({
    name: 'callService',
    description: 'Invokes a generic AXiM service endpoint.',
    keywords: ['call service', 'invoke service', 'remote call'],
    usage: 'call service <service_name> <endpoint> <json_payload>',
    category: 'External',
    entities: [
      { name: 'serviceName', required: true, prompt: 'Which service?' },
      { name: 'endpoint', required: true, prompt: 'Which endpoint?' },
      { name: 'payload', required: false, prompt: 'JSON Payload?' }
    ],
    parse: (input) => {
      // Matches: call service my-service /my-endpoint { "foo": "bar" }
      const match = input.match(/service\s+([\w-]+)\s+([/\w-]+)(?:\s+(.*))?/i);
      if (match) {
        return {
          serviceName: match[1],
          endpoint: match[2],
          payload: match[3] // string, needs parsing in validate or execute
        };
      }
      return {};
    },
    validate: (args) => {
        if (args.payload) {
            try {
                // Ensure it's valid JSON if provided
                if (typeof args.payload === 'string') {
                    args.parsedPayload = JSON.parse(args.payload);
                } else {
                    args.parsedPayload = args.payload;
                }
            } catch (e) {
                throw new Error('Payload must be valid JSON.');
            }
        } else {
            args.parsedPayload = {};
        }
    },
    async execute({ serviceName, endpoint, parsedPayload }, { aximCore }) {
       try {
           const response = await aximCore.api.invokeAximService(serviceName, endpoint, parsedPayload, aximCore.userId);

           if (response.status === 'queued') {
               return {
                   message: `Request to ${serviceName} queued.`,
                   status: 'queued'
               };
           }

           return {
               message: `Service ${serviceName} responded:`,
               data: response
           };
       } catch (error) {
           return {
               type: 'error',
               message: `Failed to call service ${serviceName}.`,
               details: error.message
           };
       }
    }
  })
];

export default externalCommands;
