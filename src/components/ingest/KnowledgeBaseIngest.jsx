import React, { useState } from 'react';
import api from '../../services/onyxAI/api';
import toast from 'react-hot-toast';
import { FiBookOpen, FiUploadCloud, FiCpu, FiFileText } from 'react-icons/fi';

const KnowledgeBaseIngest = () => {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('text'); // text, url, file

  const handleIngest = async () => {
    if (!title) {
        toast.error("Please provide a title for the knowledge base entry.");
        return;
    }

    setLoading(true);
    let contentToIngest = text;
    let sourceType = activeTab;

    try {
      if (activeTab === 'url') {
          if (!url) throw new Error("URL is required.");
          toast.loading("Scraping URL...", { id: 'ingest' });
          const { content, error } = await api.fetchUrl(url);
          if (error) throw new Error(error);
          if (!content) throw new Error('No content retrieved.');
          contentToIngest = content;
          toast.loading("Generating embeddings...", { id: 'ingest' });
      } else {
          if (!text) throw new Error("Text content is required.");
          toast.loading("Generating embeddings...", { id: 'ingest' });
      }

      // Call Edge Function
      const { data, error } = await api.supabase.functions.invoke('knowledge-ingest', {
          body: { title, text: contentToIngest, source_type: sourceType }
      });

      if (error) throw error;

      toast.success(`Successfully ingested ${data.processed_chunks} chunks into Executive Brain.`, { id: 'ingest' });
      setTitle('');
      setText('');
      setUrl('');
    } catch (err) {
      console.error(err);
      toast.error(`Failed to ingest: ${err.message}`, { id: 'ingest' });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
          setText(e.target.result);
          if (!title) setTitle(file.name);
      };
      reader.readAsText(file);
  };

  return (
    <div className="bg-onyx-950/50 backdrop-blur-md rounded-xl p-6 border border-onyx-accent/20">
      <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
        <FiBookOpen className="mr-2 text-onyx-accent" />
        Executive Knowledge Base Ingestion
      </h2>

      <div className="flex space-x-4 mb-4 border-b border-onyx-accent/20 pb-2">
          <button
              onClick={() => setActiveTab('text')}
              className={`text-sm pb-2 px-2 transition-colors ${activeTab === 'text' ? 'text-onyx-accent border-b-2 border-onyx-accent font-medium' : 'text-slate-400 hover:text-slate-200'}`}
          >
              Raw Text
          </button>
          <button
              onClick={() => setActiveTab('url')}
              className={`text-sm pb-2 px-2 transition-colors ${activeTab === 'url' ? 'text-onyx-accent border-b-2 border-onyx-accent font-medium' : 'text-slate-400 hover:text-slate-200'}`}
          >
              Scrape URL
          </button>
          <button
              onClick={() => setActiveTab('file')}
              className={`text-sm pb-2 px-2 transition-colors ${activeTab === 'file' ? 'text-onyx-accent border-b-2 border-onyx-accent font-medium' : 'text-slate-400 hover:text-slate-200'}`}
          >
              File Upload (TXT)
          </button>
      </div>

      <div className="space-y-4">
        <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Document Title / Topic</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., SOP for Client Onboarding"
              className="w-full bg-onyx-900 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-onyx-accent"
            />
        </div>

        {activeTab === 'url' && (
            <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Target URL</label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/playbook"
                  className="w-full bg-onyx-900 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-onyx-accent"
                />
            </div>
        )}

        {activeTab === 'file' && (
             <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Upload File</label>
                <input
                  type="file"
                  accept=".txt,.csv,.md"
                  onChange={handleFileUpload}
                  className="w-full bg-onyx-900 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white focus:outline-none file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-onyx-accent/20 file:text-onyx-accent hover:file:bg-onyx-accent/30"
                />
            </div>
        )}

        {(activeTab === 'text' || activeTab === 'file') && (
            <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Document Content</label>
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Paste your standard operating procedures, playbook data, or document content here..."
                    rows={8}
                    className="w-full bg-onyx-900 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-onyx-accent resize-y"
                />
            </div>
        )}

        <button
          onClick={handleIngest}
          disabled={loading || !title || (activeTab === 'url' ? !url : !text)}
          className="w-full bg-onyx-accent/20 border border-onyx-accent/50 hover:bg-onyx-accent hover:text-onyx-950 text-onyx-accent px-4 py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-medium"
        >
          {loading ? <FiCpu className="animate-spin mr-2" /> : <FiUploadCloud className="mr-2" />}
          {loading ? 'Processing & Vectorizing...' : 'Ingest to Executive Brain'}
        </button>
      </div>
    </div>
  );
};

export default KnowledgeBaseIngest;
