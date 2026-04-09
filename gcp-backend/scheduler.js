import cron from 'node-cron';
import googleTrends from 'google-trends-api';
import apiService from './apiService.js';

class Scheduler {
  constructor() {
    this.jobs = new Map(); // Store cron jobs: automationId -> cronTask
    this.isRunning = false;
  }

  async initScheduler() {
    console.log('Initializing Scheduler Service...');
    try {
      await this.refreshScheduler();
      this.isRunning = true;
      console.log('Scheduler Service initialized.');
    } catch (error) {
      console.error('Failed to initialize Scheduler:', error);
    }
  }

  async refreshScheduler() {
    console.log('Refreshing automation schedule...');
    // Stop all existing jobs
    this.jobs.forEach(job => job.stop());
    this.jobs.clear();

    try {
      const automations = await apiService.getActiveAutomations();
      if (!automations || automations.length === 0) {
        console.log('No active automations found.');
        return;
      }

      console.log(`Found ${automations.length} active automations.`);

      automations.forEach(auto => {
        if (!cron.validate(auto.schedule)) {
          console.warn(`Invalid cron expression for automation ${auto.command} (${auto.id}): ${auto.schedule}`);
          return;
        }

        // We assume command holds a JSON string with the config for the automation, including type and config
        // E.g., command: '{"type": "news_scan_and_report", "timezone": "America/New_York", "config": {"topic": "industry news"}}'
        let parsedCommand = {};
        try {
          parsedCommand = JSON.parse(auto.command);
        } catch (error) {
          console.warn(`Could not parse command JSON for task ${auto.id}, falling back to default command as type.`, error.message);
          parsedCommand = { type: auto.command, config: {} };
        }

        const autoData = {
          ...auto,
          name: auto.id,
          type: parsedCommand.type || auto.command,
          config: parsedCommand.config || {}
        };

        const options = parsedCommand.timezone ? { timezone: parsedCommand.timezone } : {};
        const task = cron.schedule(auto.schedule, () => {
          this.executeAutomation(autoData);
        }, options);

        this.jobs.set(auto.id, task);
        console.log(`Scheduled automation: ${autoData.type} (${auto.schedule})`);
      });

    } catch (error) {
      console.error('Error refreshing scheduler:', error);
    }
  }

  async executeAutomation(automation) {
    const startTime = Date.now();
    console.log(`Executing automation: ${automation.name} (${automation.type})`);

    let status = 'success';
    let output = {};

    try {
      switch (automation.type) {
        case 'google_trends_scan':
          output = await this.handleGoogleTrendsScan(automation.config);
          break;
        case 'content_engine_feed':
          output = await this.handleContentEngineFeed(automation.config, automation.user_id);
          break;
        case 'memory_summary':
          output = await this.handleMemorySummary(automation.config);
          break;
        case 'news_scan_and_report':
          output = await this.handleNewsScanAndReport(automation.config, automation.user_id);
          break;
        default:
          throw new Error(`Unknown automation type: ${automation.type}`);
      }
    } catch (error) {
      console.error(`Automation ${automation.name} failed:`, error);
      status = 'failed';
      output = { error: error.message, stack: error.stack };
    } finally {
      const duration = Date.now() - startTime;

      // Log execution
      await apiService.logAutomationExecution(automation.id, status, output, duration);

      // Update last run and next run
      // Note: cron.schedule doesn't give next run easily, but we can calculate or just update last_run
      await apiService.updateAutomationRunTime(automation.id, null); // nextRun is complex to calc here, maybe skip or use a lib

      console.log(`Automation ${automation.name} finished in ${duration}ms with status: ${status}`);
    }
  }

  async handleGoogleTrendsScan(config) {
    const geo = config.geo || 'US';
    console.log(`Fetching Google Trends for geo: ${geo}...`);

    try {
      // google-trends-api returns a stringified JSON
      const results = await googleTrends.dailyTrends({ geo });
      const parsed = JSON.parse(results);

      // Extract relevant data
      // dailyTrends usually has default -> trendingSearchesDays -> trendingSearches
      const trendingDays = parsed.default?.trendingSearchesDays || [];
      const todaysTrends = trendingDays[0]?.trendingSearches || [];

      // Limit to top 5 to avoid overwhelming content engine
      const topTrends = todaysTrends.slice(0, 5).map(t => ({
        title: t.title.query,
        traffic: t.formattedTraffic,
        articles: t.articles.map(a => ({ title: a.title, url: a.url, source: a.source }))
      }));

      console.log(`Found ${topTrends.length} trends. Feeding to Content Engine...`);

      // Feed to Content Engine
      // We pass the trends as context/topics
      const contentEnginePayload = {
        source: 'google_trends_automation',
        trends: topTrends,
        // Optional: trigger generation immediately for each
        action: 'generate_news_batch'
      };

      const response = await apiService.triggerContentEngine(contentEnginePayload);
      return { trends_found: topTrends.length, content_engine_response: response };

    } catch (error) {
      throw new Error(`Google Trends Scan failed: ${error.message}`);
    }
  }

  async handleContentEngineFeed(config, userId) {
    const feedUrl = config.url || process.env.HACKERNEWS_RSS_URL || 'https://hnrss.org/frontpage'; // Default to HackerNews RSS if none provided
    console.log(`Fetching feed for content engine: ${feedUrl}`);

    try {
      const response = await fetch(feedUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch feed: ${response.statusText}`);
      }
      const rawXml = await response.text();

      // Basic regex parsing for RSS (in a real app, use an xml parser like fast-xml-parser)
      // Extract top 5 item titles and links
      const items = [];
      const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>/g;
      let match;
      let count = 0;

      while ((match = itemRegex.exec(rawXml)) !== null && count < 5) {
        // Simple CDATA removal if present
        const cleanTitle = match[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
        const cleanLink = match[2].trim();

        items.push({
          title: cleanTitle,
          link: cleanLink
        });
        count++;
      }

      console.log(`Extracted ${items.length} items from feed. Feeding to Content Engine...`);

      const contentEnginePayload = {
        action: 'process_external_feed',
        source: feedUrl,
        items: items,
        userId: userId
      };

      const engineResponse = await apiService.triggerContentEngine(contentEnginePayload);

      return { items_processed: items.length, content_engine_response: engineResponse };
    } catch (error) {
      throw new Error(`Content Engine Feed failed: ${error.message}`);
    }
  }

  async handleNewsScanAndReport(config, userId) {
    const topic = config.topic || 'industry news';
    const geo = config.geo || 'US';
    console.log(`Executing News Scan for topic: ${topic}, geo: ${geo}...`);

    try {
      // We will use Google Trends as a proxy for top news for now
      // This could be easily swapped out with a dedicated News API
      const results = await googleTrends.dailyTrends({ geo });
      const parsed = JSON.parse(results);

      const trendingDays = parsed.default?.trendingSearchesDays || [];
      const todaysTrends = trendingDays[0]?.trendingSearches || [];

      const topTrends = todaysTrends.slice(0, 5).map(t => ({
        title: t.title.query,
        traffic: t.formattedTraffic,
        articles: t.articles.map(a => ({ title: a.title, url: a.url, source: a.source }))
      }));

      // Send the fetched news to the content engine to build a structured report
      const reportPayload = {
        action: 'generate_news_report',
        topic,
        trends: topTrends,
        userId
      };

      const reportResponse = await apiService.triggerContentEngine(reportPayload);
      const generatedReport = reportResponse?.report || JSON.stringify(topTrends, null, 2);

      // Log the generated report as an AI interaction so the user can see it in their command hub
      await apiService.logAIInteraction(
        `SYSTEM: Generated Daily News Report (${topic})`,
        generatedReport,
        0,
        'success',
        userId,
        'system-news-report',
        'report',
        'system',
        'report-model'
      );

      return {
        trends_found: topTrends.length,
        report_generated: !!reportResponse?.report
      };
    } catch (error) {
      throw new Error(`News Scan and Report failed: ${error.message}`);
    }
  }

  async handleMemorySummary(config) {
    const userId = config.userId;
    if (!userId) {
      throw new Error("Memory summary requires a userId in its config.");
    }
    console.log(`Generating daily memory summary for user ${userId}...`);

    try {
      // 1. Fetch interactions from the past 24 hours
      const query = `
        SELECT command, response, created_at
        FROM ai_interactions_ax2024
        WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '1 day'
        ORDER BY created_at ASC
      `;
      const result = await apiService.db.query(query, [userId]);
      const interactions = result.rows;

      if (interactions.length === 0) {
        console.log(`No interactions found for user ${userId} in the last 24h.`);
        return { message: 'No interactions to summarize' };
      }

      // 2. Format interactions into a text block
      const textBlock = interactions.map(i => `[${i.created_at}] User: ${i.command}\nAI: ${i.response}`).join('\n\n');

      // 3. Summarize using a default provider via the proxy or direct call
      // Since the proxy requires a user token, an alternative is calling the LLM directly here or
      // using a system-level token. For simplicity, we just format the summary text and store it
      // as a new interaction or log, or use a system level request to `triggerContentEngine`.
      const summaryPayload = {
        action: 'generate_memory_summary',
        text: textBlock,
        userId: userId
      };

      const summaryResponse = await apiService.triggerContentEngine(summaryPayload);

      // Store the generated summary back into ai_interactions_ax2024 as a high-level memory
      if (summaryResponse && summaryResponse.summary) {
         await apiService.logAIInteraction(
            "SYSTEM: Daily Memory Summary",
            summaryResponse.summary,
            0,
            'success',
            userId,
            'system-summary-thread',
            'summary',
            'system',
            'summary-model'
         );
      }

      return { summary: summaryResponse ? summaryResponse.summary : 'Summary generation triggered' };
    } catch (error) {
      throw new Error(`Memory Summary failed: ${error.message}`);
    }
  }
}

const scheduler = new Scheduler();
export default scheduler;
