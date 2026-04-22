const fs = require('fs');

let content = fs.readFileSync('src/components/dashboard/ApiUsageChart.jsx', 'utf8');

// Replace LineChart with BarChart and Line with Bar
content = content.replace("import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';", "import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';");
content = content.replace(/<LineChart/g, "<BarChart");
content = content.replace(/<\/LineChart>/g, "</BarChart>");
content = content.replace(/<Line type="monotone" dataKey="count" stroke="#2DD4BF" strokeWidth=\{2\} \/>/g,
  `<Bar dataKey="successCount" name="Requests Made" fill="#2DD4BF" radius={[4, 4, 0, 0]} />
   <Bar dataKey="errorCount" name="Errors" fill="#EF4444" radius={[4, 4, 0, 0]} />`);
content = content.replace("<XAxis dataKey=\"date\" stroke=\"#9CA3AF\" fontSize={12} />",
  `<XAxis dataKey="date" stroke="#9CA3AF" fontSize={12} />
   <Legend wrapperStyle={{ paddingTop: '20px' }} />`);

// Refactor data fetching to query supabase api_usage_logs
// "Fetch real api_usage_logs via Supabase client, aggregating by date to compare 'Requests Made' vs 'Errors'."

// Import supabase
content = content.replace("import { useDashboard } from '../../contexts/DashboardContext';",
  "import { useDashboard } from '../../contexts/DashboardContext';\nimport { supabase } from '../../services/supabaseClient';");

const oldFetch = `    try {
      const apiUsageData = await api.getApiUsageOverTime();
      const formattedData = apiUsageData.map(item => ({
        date: new Date(item.date).toLocaleDateString(),
        count: parseInt(item.count)
      }));
      setData(formattedData);
    } catch (error) {
      logger.error('Error fetching API usage data:', error);
      setError('Failed to load API usage data.');
    } finally {
      setLoading(false);
    }`;

const newFetch = `    try {
      // Get the current user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No authenticated user");

      // Fetch logs for the past 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: logs, error: supabaseError } = await supabase
        .from('api_usage_logs')
        .select('created_at, status_code')
        .eq('partner_id', user.id)
        .gte('created_at', sevenDaysAgo.toISOString());

      if (supabaseError) throw supabaseError;

      // Aggregate by date
      const aggregated = {};
      logs.forEach(log => {
        const date = new Date(log.created_at).toLocaleDateString();
        if (!aggregated[date]) {
          aggregated[date] = { date, successCount: 0, errorCount: 0 };
        }
        if (log.status_code >= 200 && log.status_code < 300) {
          aggregated[date].successCount++;
        } else {
          aggregated[date].errorCount++;
        }
      });

      // Sort by date and convert to array
      const formattedData = Object.values(aggregated).sort((a, b) => new Date(a.date) - new Date(b.date));

      // If no data, provide an empty structure for today
      if (formattedData.length === 0) {
         formattedData.push({ date: new Date().toLocaleDateString(), successCount: 0, errorCount: 0 });
      }

      setData(formattedData);
    } catch (error) {
      logger.error('Error fetching API usage data:', error);
      setError('Failed to load API usage data.');
    } finally {
      setLoading(false);
    }`;

content = content.replace(oldFetch, newFetch);

fs.writeFileSync('src/components/dashboard/ApiUsageChart.jsx', content);
