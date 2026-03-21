import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workflowDefinitions } from './definitions';
import api from '../onyxAI/api';
import { generateContent } from '../onyxAI/llm';

// Mock dependencies
vi.mock('../onyxAI/api');
vi.mock('../onyxAI/llm');

describe('Workflow Definitions', () => {

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('axim_project_initiation', () => {
    const workflow = workflowDefinitions.axim_project_initiation;

    it('should have the correct name and description', () => {
      expect(workflow.name).toBe('Axim Project Initiation');
      expect(workflow.description).toBe('Initializes a new project within the Axim Core system.');
    });

    it('should have 4 steps', () => {
      expect(workflow.steps).toHaveLength(4);
    });

    describe('Step 1: Create New Axim Project', () => {
      const step = workflow.steps[0];

      it('should create a project and return its details', async () => {
        const mockProject = { id: 1, name: 'New Project' };
        api.createProject.mockResolvedValue(mockProject);

        const result = await step.action({ userId: 'test-user' });

        expect(api.createProject).toHaveBeenCalled();
        expect(result.message).toBe(`Successfully created project "${mockProject.name}".`);
        expect(result.projectId).toBe(mockProject.id);
        expect(result.projectName).toBe(mockProject.name);
      });
    });

    describe('Step 2: Assign Default Tasks', () => {
      const step = workflow.steps[1];

      it('should assign tasks to users', async () => {
        const mockUsers = [{ id: 'user-1' }, { id: 'user-2' }];
        const mockTasks = [{ id: 1 }, { id: 2 }, { id: 3 }];
        api.getUsers.mockResolvedValue(mockUsers);
        api.createTasks.mockResolvedValue(mockTasks);

        const context = { projectId: 1, userId: 'test-user' };
        const result = await step.action(context);

        expect(api.getUsers).toHaveBeenCalled();
        expect(api.createTasks).toHaveBeenCalledWith([
          { project_id: 1, title: 'Setup development environment', assignee_id: 'user-1' },
          { project_id: 1, title: 'Draft project specification', assignee_id: 'user-2' },
          { project_id: 1, title: 'Schedule kick-off meeting', assignee_id: 'user-1' },
        ], 'test-user');
        expect(result.message).toBe(`Assigned 3 default tasks to 2 team members.`);
      });

      it('should throw an error if no users are found', async () => {
        api.getUsers.mockResolvedValue([]);
        await expect(step.action({ projectId: 1 })).rejects.toThrow('No users found to assign tasks.');
      });
    });

    describe('Step 3: Generate Kick-off Meeting Agenda', () => {
      const step = workflow.steps[2];

      it('should generate an agenda with the project name', async () => {
        const mockAgenda = 'Meeting Agenda...';
        generateContent.mockResolvedValue(mockAgenda);
        const context = { projectName: 'Test Project' };

        const result = await step.action(context);

        expect(generateContent).toHaveBeenCalledWith(
          'Generate a concise agenda for a project kick-off meeting for a new software project called "Test Project". Include topics like project goals, scope, timeline, and team roles.'
        );
        expect(result.message).toBe('Generated kick-off meeting agenda.');
        expect(result.agenda).toBe(mockAgenda);
      });
    });

    describe('Step 4: Notify Stakeholders', () => {
        const step = workflow.steps[3];

        it('should return a success message', async () => {
          const consoleSpy = vi.spyOn(console, 'log');
          const result = await step.action({});
          expect(result.message).toBe('Notified all relevant stakeholders about project initiation.');
          expect(consoleSpy).toHaveBeenCalledWith('Simulating notification to stakeholders...');
          consoleSpy.mockRestore();
        });
      });
    });

  describe('audio_intelligence', () => {
    const workflow = workflowDefinitions.audio_intelligence;

    it('should have correct name and description', () => {
      expect(workflow.name).toBe('Audio Intelligence Pipeline');
      expect(workflow.description).toContain('Transcribes audio');
    });

    describe('Step 1: Initiate Transcription', () => {
      const step = workflow.steps[0];

      it('should initiate transcription and return result', async () => {
        const mockResult = { transcriptionId: 'job-123' };
        api.initiateTranscription.mockResolvedValue(mockResult);
        const context = { source: 'http://audio.url', userId: 'u1' };

        const result = await step.action(context);

        expect(api.initiateTranscription).toHaveBeenCalledWith('http://audio.url', 'u1');
        expect(result.message).toBe('Transcription job started. You will be notified when it completes.');
        expect(result.transcriptionId).toBe('job-123');
        expect(result.status).toBe('queued');
      });

      it('should throw if source is missing', async () => {
        await expect(step.action({})).rejects.toThrow('Audio source URL required.');
      });
    });
  });

  describe('crm_sync', () => {
    const workflow = workflowDefinitions.crm_sync;

    it('should have correct name and description', () => {
      expect(workflow.name).toBe('CRM Data Synchronization');
      expect(workflow.description).toBe('Syncs new contacts and events to an external CRM system.');
    });

    describe('Step 1: Fetch New Contacts', () => {
      const step = workflow.steps[0];

      it('should fetch contacts and return them', async () => {
        const mockContacts = [{ id: 1 }, { id: 2 }];
        api.listAllContacts.mockResolvedValue(mockContacts);
        const context = { userId: 'test-user' };

        const result = await step.action(context);

        expect(api.listAllContacts).toHaveBeenCalledWith({}, 'test-user');
        expect(result.message).toBe('Fetched 2 contacts for CRM sync.');
        expect(result.contactsToSync).toEqual(mockContacts);
      });
    });

    describe('Step 2: Push to CRM API', () => {
      const step = workflow.steps[1];

      it('should skip if no contacts to sync', async () => {
        const context = { contactsToSync: [] };
        const result = await step.action(context);

        expect(result.message).toBe('No new contacts to sync.');
      });

      it('should simulate push if contacts exist', async () => {
        api.invokeAximService.mockResolvedValueOnce({ jobId: 'mock-job-id' });
        const context = { contactsToSync: [{ id: 1 }], userId: 'test-user-id' };
        const result = await step.action(context);

        expect(api.invokeAximService).toHaveBeenCalledWith('crm-integration', 'bulk-upsert', { contacts: context.contactsToSync }, 'test-user-id');
        expect(result.message).toBe('Successfully synced 1 contacts to CRM.');
        expect(result.syncedCount).toBe(1);
        expect(result.jobId).toBe('mock-job-id');
      });
    });
  });
});