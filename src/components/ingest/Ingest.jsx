import React from 'react';
import { motion } from 'framer-motion';
import SpreadsheetImport from './SpreadsheetImport';
import WebContentIngest from './WebContentIngest';

const Ingest = () => {
  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="space-y-8"
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Data Ingestion Center</h1>
          <p className="text-slate-400">Import, sort, and clean data for your CRM.</p>
        </div>

        <WebContentIngest />
        <SpreadsheetImport />

      </motion.div>
    </div>
  );
};

export default Ingest;