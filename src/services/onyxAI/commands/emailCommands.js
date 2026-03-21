import { createCommand } from './commandFactory';
import api from '../api';
import { CommandValidationError } from '../errors';

const EMAIL_DIRECTORY = {
  'james': 'james.ellars@axim.us.com',
  'james ellars': 'james.ellars@axim.us.com',
  'ceo': 'james.ellars@axim.us.com', // Assuming CEO refers to James, unless specified as AI
  'president': 'james.ellars@axim.us.com',
  'operations': 'agent@3doof7t5ug.chatbase-mail.com',
  'operations agent': 'agent@3doof7t5ug.chatbase-mail.com',
  'ops': 'agent@3doof7t5ug.chatbase-mail.com',
  'ceo agent': 'agent@e7byynw7a3.chatbase-mail.com',
  'ceo assistant': 'agent@e7byynw7a3.chatbase-mail.com',
  'cto': 'agent@vn0nwrgyd5.chatbase-mail.com',
  'cto agent': 'agent@vn0nwrgyd5.chatbase-mail.com',
  'cfo': 'agent@44nt3p9b5y.chatbase-mail.com',
  'cfo agent': 'agent@44nt3p9b5y.chatbase-mail.com',
  'central': 'agent@1lihl3gpvw.chatbase-mail.com',
  'central operator': 'agent@1lihl3gpvw.chatbase-mail.com',
  'operator': 'agent@1lihl3gpvw.chatbase-mail.com',
  'legal': 'agent@hsck64k24f.chatbase-mail.com',
  'legal agent': 'agent@hsck64k24f.chatbase-mail.com',
};

const emailCommand = createCommand({
  name: 'sendEmail',
  description: 'Sends an email to a user or an AXiM AI Agent.',
  keywords: ['email', 'send email', 'consult', 'ask', 'message'],
  usage: 'email <recipient> <message>',
  category: 'Communication',
  entities: [
    { name: 'RECIPIENT', required: true, prompt: 'Who would you like to email?' },
    { name: 'MESSAGE', required: true, prompt: 'What is the message?' }
  ],
  parse: (command) => {
    // Basic regex to split "email [recipient] [message]"
    // Handles: "email James about the project", "ask CTO regarding server status"
    // Limitations: complex sentences might need better NLP, but this covers the basics.

    const parts = command.trim().split(/\s+/);
    if (parts.length < 2) return {}; // Need at least "email <someone>"

    // Remove the command keyword (email, ask, consult)
    const keyword = parts.shift().toLowerCase();

    // Attempt to identify the recipient from the start of the remaining string
    let recipientKey = parts[0].toLowerCase();
    let messageStartIndex = 1;

    // specialized handling for multi-word aliases like "james ellars" or "ceo agent"
    if (parts.length > 1) {
        const potentialTwoWordKey = `${parts[0]} ${parts[1]}`.toLowerCase();
        if (EMAIL_DIRECTORY[potentialTwoWordKey]) {
            recipientKey = potentialTwoWordKey;
            messageStartIndex = 2;
        }
    }

    // Check if the extracted key maps to an email
    let recipient = EMAIL_DIRECTORY[recipientKey];

    // If not found in directory, check if it looks like an email address
    if (!recipient && recipientKey.includes('@')) {
        recipient = recipientKey;
    }

    // If still not found, and we didn't use a multi-word key, maybe it's a name we don't know?
    // In that case, we pass it as is and let validation or execution handle it (or fail).
    if (!recipient && !recipientKey.includes('@')) {
         // Fallback: treat the first word as the recipient name (for now)
         recipient = recipientKey;
    }

    const message = parts.slice(messageStartIndex).join(' ');

    return {
      RECIPIENT: recipient,
      // If message is empty string, return undefined so validation prompts for it
      MESSAGE: message.trim() ? message : undefined
    };
  },
  execute: async ({ RECIPIENT, MESSAGE }, { userId }) => {
    // 1. Resolve Recipient
    let emailAddress = RECIPIENT;
    // Check directory again in case it was passed directly as a name
    const directoryMatch = Object.keys(EMAIL_DIRECTORY).find(key => key === RECIPIENT.toLowerCase());
    if (directoryMatch) {
        emailAddress = EMAIL_DIRECTORY[directoryMatch];
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailAddress)) {
        throw new CommandValidationError(`Invalid email address or unknown alias: "${RECIPIENT}". Please provide a valid email or a known agent name (e.g., 'CTO', 'James').`);
    }

    // 2. Loop Prevention (Basic)
    // If the message contains specific headers or patterns indicating an automated loop, we should block it.
    // For outbound from Core, this is less of an issue, but good to keep in mind.
    // We could add a signature.

    const finalMessage = `${MESSAGE}\n\n--\nSent from AXiM Core`;

    try {
        const result = await api.sendEmail(emailAddress, `Consultation Request from AXiM Core`, finalMessage, userId);
        return `✅ Email successfully sent to ${emailAddress}.`;
    } catch (error) {
        throw new Error(`Failed to send email: ${error.message}`);
    }
  },
});

export default [emailCommand];
