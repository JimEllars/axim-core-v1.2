import React from 'react';
import { motion } from 'framer-motion';

const SLABadge = ({ ticket }) => {
  const isBreached = ticket.status === 'Action Required';

  if (!isBreached) {
    return (
      <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-bold">
        SLA OK
      </span>
    );
  }

  return (
    <motion.span
      animate={{ opacity: [1, 0.5, 1] }}
      transition={{ repeat: Infinity, duration: 1 }}
      className="px-2 py-1 bg-red-500/20 text-red-400 border border-red-500/50 rounded text-xs font-bold inline-block"
    >
      SLA BREACH
    </motion.span>
  );
};

export default SLABadge;
