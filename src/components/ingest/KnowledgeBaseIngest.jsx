import React, { useState } from 'react';
import api from '../../services/onyxAI/api';
import toast from 'react-hot-toast';
import { FiBookOpen, FiUploadCloud, FiCpu, FiFileText } from 'react-icons/fi';
import { useSupabase } from '../../contexts/SupabaseContext';

const KnowledgeBaseIngest = () => {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('text'); // text, url, file
  const [filesToUpload, setFilesToUpload] = useState([]);
  const [personaTag, setPersonaTag] = useState('');
  const [affiliatePartner, setAffiliatePartner] = useState('None');
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const { supabase } = useSupabase();

  const handleIngest = async () => {
    if (!title && activeTab !== 'file') {
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
      } else if (activeTab === 'file' && filesToUpload.length > 0) {
          toast.loading("Batch processing files...", { id: 'ingest' });

          setUploadProgress({ current: 0, total: filesToUpload.length });

          let successCount = 0;
          for (let i = 0; i < filesToUpload.length; i++) {
              const file = filesToUpload[i];
              const fileTitle = title || file.name;

              const fileExt = file.name.split('.').pop();
              const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
              const filePath = `playbooks/${fileName}`;

              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('executive_knowledge')
                .upload(filePath, file);

              if (!uploadError) {
                  const { error } = await api.supabase.functions.invoke('knowledge-ingest', {
                     body: { title: fileTitle, file_path: uploadData.path, source_type: 'storage', category: personaTag, partner: affiliatePartner === 'None' ? null : affiliatePartner }
                  });
                  if (!error) successCount++;
              }
              setUploadProgress({ current: i + 1, total: filesToUpload.length });
          }

          toast.success(`Successfully ingested ${successCount} files into Executive Brain.`, { id: 'ingest' });
          setTitle('');
          setText('');
          setUrl('');
          setFilesToUpload([]);
          setLoading(false);
          setUploadProgress({ current: 0, total: 0 });
          return;
      } else {
          if (!text) throw new Error("Text content is required.");
          toast.loading("Generating embeddings...", { id: 'ingest' });
      }

      // Call Edge Function for Text/URL
      const { data, error } = await api.supabase.functions.invoke('knowledge-ingest', {
          body: { title, text: contentToIngest, source_type: sourceType, category: personaTag, partner: affiliatePartner === 'None' ? null : affiliatePartner }
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
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      setFilesToUpload(files);
      if (files.length === 1 && !title) setTitle(files[0].name);

      // We'll still read as text so the user can preview/edit it if they want (only for single file)
      if (files.length === 1) {
          const reader = new FileReader();
          reader.onload = (e) => {
              setText(e.target.result);
          };
          reader.readAsText(files[0]);
      } else {
          setText(`${files.length} files selected for batch ingestion.`);
      }
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
          {window.electronAPI && (
            <button
                onClick={() => setActiveTab('native')}
                className={`text-sm pb-2 px-2 transition-colors ${activeTab === 'native' ? 'text-onyx-accent border-b-2 border-onyx-accent font-medium' : 'text-slate-400 hover:text-slate-200'}`}
            >
                Native Directory Ingest (Desktop Only)
            </button>
          )}
      </div>


      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Document Title / Topic (Optional for multiple files)</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., SOP for Client Onboarding"
                  className="w-full bg-onyx-900 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-onyx-accent"
                />
            </div>
            <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Context Persona / Tag</label>
                <select
                  value={personaTag}
                  onChange={(e) => setPersonaTag(e.target.value)}
                  className="w-full bg-onyx-900 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-onyx-accent"
                >
                  <option value="">General Knowledge</option>
                  <option value="James Ellars / Political">James Ellars / Political</option>
                  <option value="AXiM / Business">AXiM / Business</option>
                  <option value="SOP / Internal">SOP / Internal</option>
                </select>
            </div>
            <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Affiliate Partner</label>
                <select
                  value={affiliatePartner}
                  onChange={(e) => setAffiliatePartner(e.target.value)}
                  className="w-full bg-onyx-900 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-onyx-accent"
                >
                  <option value="None">None</option>
                  <option value="Make.com">Make.com</option>
                  <option value="Powur Solar">Powur Solar</option>
                  <option value="Roundups">Roundups</option>
                </select>
            </div>
        </div>


        {activeTab === 'native' && (
             <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Native Batch Ingest</label>
                <button
                    onClick={async () => {
                        setLoading(true);
                        try {
                           const res = await window.electronAPI.invoke('readLocalDirectory');
                           if (!res.success) {
                               setLoading(false);
                               return;
                           }

                           setUploadProgress({ current: 0, total: res.files.length });

                           // Setup progress listener
                           const cleanup = window.electronAPI.on('ingest-progress', (progress) => {
                               setUploadProgress({ current: progress.current, total: progress.total });
                           });

                           let token = '';
                           for (let i = 0; i < localStorage.length; i++) {
                              const key = localStorage.key(i);
                              if (key.endsWith('-auth-token')) {
                                  const session = localStorage.getItem(key);
                                  if (session) {
                                     try {
                                        token = JSON.parse(session).access_token || '';
                                        break;
                                     } catch (e) { /* ignore */ }
                                  }
                              }
                           }

                           const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321';

                           const result = await window.electronAPI.invoke('processLocalDirectory', {
                               dirPath: res.dirPath,
                               files: res.files,
                               token,
                               supabaseUrl
                           });

                           cleanup();
                           toast.success(`Native ingest complete. Processed ${result.processed} files.`);

                        } catch(e) {
                           toast.error(e.message);
                        } finally {
                           setLoading(false);
                           setUploadProgress({ current: 0, total: 0 });
                        }
                    }}
                    className="w-full bg-onyx-900 border border-onyx-accent/20 rounded-lg px-4 py-2 text-onyx-accent focus:outline-none hover:bg-onyx-accent/10"
                >
                    Select Folder to Ingest
                </button>
                {uploadProgress.total > 0 && (
                    <div className="mt-2 text-xs text-onyx-accent">
                        Native Processing: {uploadProgress.current} / {uploadProgress.total} files
                    </div>
                )}
            </div>
        )}

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
                <label className="block text-xs font-medium text-slate-400 mb-1">Upload File(s)</label>
                <input
                  type="file"
                  multiple
                  accept=".txt,.csv,.md,.pdf,.docx"
                  onChange={handleFileUpload}
                  className="w-full bg-onyx-900 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white focus:outline-none file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-onyx-accent/20 file:text-onyx-accent hover:file:bg-onyx-accent/30"
                />
                {uploadProgress.total > 0 && (
                    <div className="mt-2 text-xs text-onyx-accent">
                        Processing: {uploadProgress.current} / {uploadProgress.total} files
                    </div>
                )}
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
          disabled={loading || (activeTab !== 'native' && (!title || (activeTab === 'url' ? !url : !text)))}
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
