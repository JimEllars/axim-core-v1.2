import React from 'react';
import { motion } from 'framer-motion';
import SpreadsheetImport from './SpreadsheetImport';
import WebContentIngest from './WebContentIngest';
import KnowledgeBaseIngest from './KnowledgeBaseIngest';

const Ingest = () => {
  return (
    <div className="p-8 bg-onyx-950 min-h-screen text-white">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="space-y-8 max-w-5xl mx-auto"
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Data Ingestion Center</h1>
          <p className="text-slate-400">Import playbooks, web content, and data into the Core.</p>
        </div>

        <KnowledgeBaseIngest />
        <WebContentIngest />
        <SpreadsheetImport />

      </motion.div>
    </div>
  );
};

export default Ingest;
