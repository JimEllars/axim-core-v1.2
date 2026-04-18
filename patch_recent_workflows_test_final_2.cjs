const fs = require('fs');
const filepath = 'src/components/dashboard/RecentWorkflows.test.jsx';
let content = fs.readFileSync(filepath, 'utf8');

// The component actually uses useSupabaseQuery, so we should mock useSupabaseQuery hook, not supabase directly
content = content.replace("vi.mock('../../services/supabaseClient');", "vi.mock('../../services/supabaseClient');\nvi.mock('../../hooks/useSupabaseQuery');");
content = content.replace("import { supabase } from '../../services/supabaseClient';", "import { supabase } from '../../services/supabaseClient';\nimport { useSupabaseQuery } from '../../hooks/useSupabaseQuery';");

const replaceAllMocks = `
  it('shows a loading state initially', () => {
    useSupabaseQuery.mockReturnValue({ data: [], loading: true });
    renderWithProvider(<RecentWorkflows />);
    expect(screen.getByText('Loading workflows...')).toBeInTheDocument();
  });

  it('shows an empty state when no workflows are returned', async () => {
    useSupabaseQuery.mockReturnValue({ data: [], loading: false });
    renderWithProvider(<RecentWorkflows />);
    await waitFor(() => {
      expect(screen.getByText('No recent workflow executions found.')).toBeInTheDocument();
    });
  });

  it('renders a list of recent workflows', async () => {
    useSupabaseQuery.mockReturnValue({ data: mockWorkflows, loading: false });
    renderWithProvider(<RecentWorkflows />);
    await waitFor(() => {
      expect(screen.getByText('Successful Workflow')).toBeInTheDocument();
      expect(screen.getByText('Failed Workflow')).toBeInTheDocument();
    });
  });

  it('displays the correct status for successful and failed workflows', async () => {
    useSupabaseQuery.mockReturnValue({ data: mockWorkflows, loading: false });
    renderWithProvider(<RecentWorkflows />);

    await waitFor(() => {
      const workflowItems = screen.getAllByTestId('workflow-item');

      const successfulWorkflow = workflowItems[0];
      expect(within(successfulWorkflow).getByText('2/2 Steps')).toBeInTheDocument();
      expect(within(successfulWorkflow).getByTestId('success-icon')).toBeInTheDocument();

      const failedWorkflow = workflowItems[1];
      expect(within(failedWorkflow).getByText('1/2 Steps')).toBeInTheDocument();
      expect(within(failedWorkflow).getByTestId('failure-icon')).toBeInTheDocument();
    });
  });
`;

content = content.replace(/it\('shows a loading state initially', \(\) => \{[\s\S]*\}\);/, replaceAllMocks);

fs.writeFileSync(filepath, content);
