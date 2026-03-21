import React, { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import onyxAI from '../../services/onyxAI';
import ProviderSelector from '../common/ProviderSelector';

const { FiCpu, FiSend, FiLoader } = FiIcons;

const GenerativeAIPanel = () => {
  const [prompt, setPrompt] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!prompt) return;

    setIsLoading(true);
    setGeneratedContent('');

    try {
      const response = await onyxAI.routeCommand(prompt);
      const content = response.content || response;
      setGeneratedContent(typeof content === 'string' ? content : JSON.stringify(content, null, 2));
      toast.success('Content generated successfully!');
    } catch (err) {
      toast.error(`Generation failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass-effect rounded-xl">
      <div className="p-6 border-b border-onyx-accent/20 flex justify-between items-center">
        <h2 className="text-xl font-semibold text-white flex items-center">
          <SafeIcon icon={FiCpu} className="mr-3 text-purple-400" />
          Generative AI Studio
        </h2>
        <ProviderSelector />
      </div>

      <div className="p-6">
        <form onSubmit={handleGenerate}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full h-32 bg-onyx-950/50 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:ring-2 focus:ring-purple-500"
            placeholder="Enter your prompt here to generate content..."
          />
          <div className="flex justify-end mt-4">
            <motion.button
              type="submit"
              disabled={isLoading || !prompt}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center justify-center px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <SafeIcon icon={FiLoader} className="animate-spin mr-2" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <SafeIcon icon={FiSend} className="mr-2" />
                  <span>Generate</span>
                </>
              )}
            </motion.button>
          </div>
        </form>

        {generatedContent && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-white mb-2">Generated Content:</h3>
            <div className="bg-onyx-950/50 p-4 rounded-lg text-slate-300 whitespace-pre-wrap">
              {generatedContent}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GenerativeAIPanel;