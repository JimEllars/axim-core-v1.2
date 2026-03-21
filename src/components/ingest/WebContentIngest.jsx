import React, { useState } from 'react';
import api from '../../services/onyxAI/api';
import * as llm from '../../services/onyxAI/llm';
import toast from 'react-hot-toast';
import { FiGlobe, FiCpu, FiCopy } from 'react-icons/fi';

const WebContentIngest = () => {
  const [url, setUrl] = useState('');
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFetchAndSummarize = async () => {
    if (!url) return;
    setLoading(true);
    setSummary('');

    try {
      // 1. Fetch
      const { content, error } = await api.fetchUrl(url);
      if (error) throw new Error(error);
      if (!content) throw new Error('No content retrieved.');

      // 2. Summarize
      const prompt = `Please provide a detailed summary of the following web content, focusing on key insights and actionable data:\n\n${content.substring(0, 8000)}`;
      const result = await llm.generateContent(prompt);

      setSummary(result);
      toast.success('Content processed successfully.');
    } catch (err) {
      console.error(err);
      toast.error(`Failed to process content: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNews = async () => {
    if (!url) return;
    setLoading(true);
    try {
        const response = await api.triggerContentEngine({ urls: [url] });
        if (response.results && response.results.length > 0) {
            const result = response.results[0];
            if (result.status === 'failed') {
                throw new Error(result.error);
            }
            toast.success('Article generated and saved!');
            setSummary(`Article Generated: ${result.title}\nID: ${result.id}\n\nCheck the "Generated Content" dashboard.`);
        } else {
            toast.success('Content engine triggered.');
        }
    } catch (err) {
        console.error(err);
        toast.error(`Failed to generate news: ${err.message}`);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="bg-onyx-950/50 backdrop-blur-md rounded-xl p-6 border border-onyx-accent/20">
      <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
        <FiGlobe className="mr-2 text-blue-400" />
        Web Content Ingestion
      </h2>

      <div className="flex space-x-2 mb-4">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter URL to scrape..."
          className="flex-1 bg-onyx-950/50 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleFetchAndSummarize}
          disabled={loading || !url}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
        >
          {loading ? <FiCpu className="animate-spin mr-2" /> : <FiCpu className="mr-2" />}
          {loading ? 'Processing...' : 'Analyze'}
        </button>
        <button
          onClick={handleGenerateNews}
          disabled={loading || !url}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
        >
           {loading ? <FiCpu className="animate-spin mr-2" /> : <FiGlobe className="mr-2" />}
           Generate News
        </button>
      </div>

      {summary && (
        <div className="mt-4 p-4 bg-onyx-950/50 rounded-lg border border-onyx-accent/20">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-medium text-slate-300">AI Summary</h3>
            <button
              onClick={() => {
                navigator.clipboard.writeText(summary);
                toast.success('Copied to clipboard');
              }}
              className="text-slate-500 hover:text-white transition-colors"
            >
              <FiCopy />
            </button>
          </div>
          <p className="text-slate-300 whitespace-pre-wrap text-sm leading-relaxed">{summary}</p>
        </div>
      )}
    </div>
  );
};

export default WebContentIngest;
