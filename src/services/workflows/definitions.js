import api from '../onyxAI/api';
import { generateContent } from '../onyxAI/llm';

export const workflowDefinitions = {
  transcription_sprint: {
    name: 'Transcription Sprint Outreach Campaign',
    description: 'An outreach campaign for the transcription sprint.',
    steps: [
      {
        name: 'Find Target Contacts',
        action: async () => {
          console.log('Finding contacts from "website"...');
          const contacts = await api.queryDatabase('website');
          return {
            message: `Identified ${contacts.length} contacts from source 'website'.`,
            contacts,
          };
        },
      },
      {
        name: 'Generate Outreach Email',
        action: async (context) => {
          const { contacts } = context;
          if (!contacts || contacts.length === 0) {
            return { message: 'No contacts to email.' };
          }
          const prompt = `Generate a short, friendly outreach email to a potential customer about our new transcription service. The customer's name is ${contacts[0].name}.`;
          const emailContent = await generateContent(prompt);
          return {
            message: 'Generated email content.',
            emailContent
          };
        },
      },
      {
        name: 'Send Outreach Emails',
        action: async (context) => {
          const { contacts, emailContent } = context;
          if (!contacts || contacts.length === 0) return { message: 'No contacts.' };

          const emailPromises = contacts.map(async (contact) => {
             try {
                // Call actual Email Service endpoint
                await api.sendEmail(
                  contact.email,
                  'Introducing Axim Transcription Sprint',
                  emailContent || "Default message",
                  context.userId
                );
                return { success: true };
             } catch (error) {
                console.error(`Failed to send to ${contact.email}:`, error);
                return { success: false };
             }
          });

          const results = await Promise.all(emailPromises);
          const successCount = results.filter(r => r.success).length;
          return { message: `Successfully sent outreach emails to ${successCount} of ${contacts.length} contacts.` };
        },
      },
    ],
  },
  lead_nurture: {
    name: 'Automated Lead Nurturing Sequence',
    description: 'An automated sequence for nurturing new leads.',
    steps: [
      {
        name: 'Identify Recent Leads',
        action: async () => {
          console.log('Finding new leads from "referral"...');
          const contacts = await api.queryDatabase('referral');
          if (contacts.length === 0) {
            throw new Error('No new referral leads found to nurture.');
          }
          return {
            message: `Identified ${contacts.length} new referral leads.`,
            leads: contacts,
          };
        },
      },
      {
        name: 'Generate Follow-up Email',
        action: async (context) => {
          const { leads } = context;
          const prompt = `Generate a personalized follow-up email for a new lead named ${leads[0].name}. The email should be welcoming and offer to schedule a brief introductory call.`;
          const emailContent = await generateContent(prompt);
          return {
            message: `Generated follow-up email for ${leads[0].name}.`,
            emailContent,
          };
        },
      },
      {
        name: 'Simulate Sending Follow-up Email',
        action: async (context) => {
          const { leads, emailContent } = context;
          console.log(`Simulating sending email to ${leads[0].email}:`, emailContent);
          return { message: `Simulated sending follow-up email to ${leads[0].name}.` };
        },
      },
      {
        name: 'Schedule Follow-up Task',
        action: async (context) => {
          const { leads } = context;
          const followUpDate = new Date();
          followUpDate.setDate(followUpDate.getDate() + 3); // 3 days from now

          await api.logWorkflowExecution('lead_nurture_task', {
            status: 'scheduled',
            details: `Scheduled follow-up call with ${leads[0].name} for ${followUpDate.toISOString().split('T')[0]}`
          });

          return { message: `Scheduled follow-up task for ${leads[0].name}.` };
        },
      },
    ],
  },
  axim_project_initiation: {
    name: 'Axim Project Initiation',
    description: 'Initializes a new project within the Axim Core system.',
    steps: [
      {
        name: 'Create New Axim Project',
        action: async (context) => {
          const project = await api.createProject(
            `New Axim Core Project - ${new Date().toLocaleDateString()}`,
            'A new project initialized by the ForemanOS Quick-Start workflow.',
            context.userId
          );
          return {
            message: `Successfully created project "${project.name}".`,
            projectId: project.id,
            projectName: project.name
          };
        },
      },
      {
        name: 'Assign Default Tasks',
        action: async (context) => {
          const { projectId } = context;
          const team = await api.getUsers();
          if (team.length === 0) {
            throw new Error('No users found to assign tasks.');
          }

          const taskTitles = [
            'Setup development environment',
            'Draft project specification',
            'Schedule kick-off meeting'
          ];

          const tasksToCreate = taskTitles.map((title, index) => ({
            project_id: projectId,
            title: title,
            assignee_id: team[index % team.length].id, // Cycle through team members
          }));

          const createdTasks = await api.createTasks(tasksToCreate, context.userId);

          return {
            message: `Assigned ${createdTasks.length} default tasks to ${team.length} team members.`,
            assignedTeam: team,
            tasks: createdTasks
          };
        },
      },
      {
        name: 'Generate Kick-off Meeting Agenda',
        action: async (context) => {
          const { projectName } = context;
          const prompt = `Generate a concise agenda for a project kick-off meeting for a new software project called "${projectName}". Include topics like project goals, scope, timeline, and team roles.`;
          const agenda = await generateContent(prompt);
          return {
            message: 'Generated kick-off meeting agenda.',
            agenda
          };
        },
      },
      {
        name: 'Notify Stakeholders',
        action: async (context) => {
          console.log('Simulating notification to stakeholders...');
          // In a real app, this would send emails or notifications
          return { message: 'Notified all relevant stakeholders about project initiation.' };
        },
      },
    ],
  },
  audio_intelligence: {
    name: 'Audio Intelligence Pipeline',
    description: 'Transcribes audio and generates an executive summary.',
    steps: [
      {
        name: 'Initiate Transcription',
        action: async (context) => {
          const { source } = context;
          if (!source) throw new Error('Audio source URL required.');

          console.log(`Initiating transcription for: ${source}`);
          // Call the external integration API
          const result = await api.initiateTranscription(source, context.userId);

          return {
            message: 'Transcription job started. You will be notified when it completes.',
            transcriptionId: result.transcriptionId || result.jobId,
            status: result.status || 'queued'
          };
        }
      },
      // Note: The subsequent steps for summarization would typically be triggered
      // by a webhook or a separate workflow once the transcription is complete.
      // We have paused the synchronous execution here to reflect the async nature.
    ]
  },
  research_assistant: {
    name: 'AI Research Assistant',
    description: 'Conducts research on a topic using external tools.',
    steps: [
      {
        name: 'Perform Research',
        action: async (context) => {
          const { topic } = context;
          if (!topic) throw new Error('Research topic required.');

          console.log(`Researching topic: ${topic}`);
          // Use the generic service invoker to call a research tool (e.g., in ForemanOS or standalone)
          const result = await api.invokeAximService('foreman-os', 'research', { topic }, context.userId);

          return {
            message: 'Research initiated.',
            researchId: result.jobId || 'mock-research-id',
            status: result.status || 'queued'
          };
        }
      }
    ]
  },
  crm_sync: {
    name: 'CRM Data Synchronization',
    description: 'Syncs new contacts and events to an external CRM system.',
    steps: [
      {
        name: 'Fetch New Contacts',
        action: async (context) => {
          console.log('Fetching new contacts for sync...');
          const contacts = await api.listAllContacts({}, context.userId);
          // In a real scenario, this would filter by 'last_synced_at'
          return {
            message: `Fetched ${contacts.length} contacts for CRM sync.`,
            contactsToSync: contacts
          };
        }
      },
      {
        name: 'Push to CRM API',
        action: async (context) => {
          const { contactsToSync } = context;
          if (!contactsToSync || contactsToSync.length === 0) {
             return { message: 'No new contacts to sync.' };
          }

          try {
             const result = await api.invokeAximService('crm-integration', 'bulk-upsert', { contacts: contactsToSync }, context.userId);
             return {
                message: `Successfully synced ${contactsToSync.length} contacts to CRM.`,
                syncedCount: contactsToSync.length,
                jobId: result.jobId
             };
          } catch (error) {
             console.error("Failed to push to CRM:", error);
             throw new Error(`CRM Sync failed: ${error.message}`);
          }
        }
      }
    ]
  }
};