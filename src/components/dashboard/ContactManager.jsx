import React, { useState } from 'react';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import toast from 'react-hot-toast';
import ContactNotesModal from './ContactNotesModal';
import { useContacts } from '../../hooks/useContacts';
import { useSupabase } from '../../contexts/SupabaseContext';
import { supabase } from '../../services/supabaseClient';

const { FiUsers, FiSearch, FiEdit, FiTrash2, FiMessageSquare, FiRefreshCw } = FiIcons;

const ContactManager = () => {
  const {
    contacts,
    loading,
    searchTerm,
    setSearchTerm,
    fetchContacts,
    deleteContact,
    updateContact,
  } = useContacts();

  const [isEditing, setIsEditing] = useState(null);
  const [editFormData, setEditFormData] = useState({ name: '', email: '' });
  const [selectedContactForNotes, setSelectedContactForNotes] = useState(null);

  const [telemetryLeads, setTelemetryLeads] = useState([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [availableSequences, setAvailableSequences] = useState([]);
  const [enrollmentTarget, setEnrollmentTarget] = useState(null);
  const [enrollmentStatuses, setEnrollmentStatuses] = useState({});

  React.useEffect(() => {
    const fetchLeads = async () => {
      setLoadingLeads(true);
      const { data } = await supabase.from('api_usage_logs').select('*').order('created_at', { ascending: false }).limit(10);
      if (data) setTelemetryLeads(data);

      const { data: seqData } = await supabase.from('crm_sequences').select('id, name');
      if (seqData) setAvailableSequences(seqData);

      const { data: enrollmentData } = await supabase.from('crm_sequence_enrollments').select('lead_id, status').eq('status', 'active');
      if (enrollmentData) {
        const statuses = {};
        enrollmentData.forEach(e => { statuses[e.lead_id] = e.status; });
        setEnrollmentStatuses(statuses);
      }
      setLoadingLeads(false);
    };
    fetchLeads();
  }, []);

  const handleAIQualify = async (lead) => {
         toast.success('Initiating AI Qualification...');
         try {
           const response = await supabase.functions.invoke('lead-triage', { body: { lead_id: lead.id } });
           if(response.error) throw new Error(response.error.message || 'Error from edge function');
           toast.success('Lead scored successfully.');
           fetchContacts(); // or refresh the local lead state
         } catch (e) {
           toast.error('AI Qualification failed.');
           console.error(e);
         }
       };

  const handleOsintScan = async (lead) => {
    toast.success('Initiating OSINT scan...');
    try {
      const url = lead.payload?.target_url || 'https://example.com';
      await supabase.functions.invoke('osint-scraper', { body: { action: 'extract_contact_info', target_url: url } });
      toast.success('OSINT scan dispatched.');
    } catch (e) {
      toast.error('OSINT scan failed to launch.');
    }
  };


  const handleEnrollLead = async (leadId, sequenceId) => {
    if (!sequenceId) return;

    const enrollPromise = supabase
      .from('crm_sequence_enrollments')
      .insert([{ lead_id: leadId, sequence_id: sequenceId, status: 'active', current_step: 0 }]);

    toast.promise(enrollPromise, {
      loading: 'Enrolling lead...',
      success: 'Lead successfully enrolled in sequence!',
      error: 'Failed to enroll lead.'
    }).then(() => {
      setEnrollmentTarget(null);
      // Refresh local statuses
      setEnrollmentStatuses(prev => ({ ...prev, [leadId]: 'active' }));
    }).catch((e) => {
      console.error(e);
    });
  };


  const handleStopSequence = async (leadId) => {
    try {
      const stopPromise = supabase
        .from('crm_sequence_enrollments')
        .update({ status: 'paused' })
        .eq('lead_id', leadId)
        .eq('status', 'active');

      await toast.promise(stopPromise, {
        loading: 'Stopping sequence...',
        success: 'Sequence stopped successfully!',
        error: 'Failed to stop sequence.'
      });

      await supabase.from('api_usage_logs').insert([{ action: 'sequence_manually_stopped', payload: { lead_id: leadId } }]);

      setEnrollmentStatuses(prev => ({ ...prev, [leadId]: 'paused' }));
      fetchContacts();
    } catch (e) {
      console.error(e);
      toast.error('An error occurred while stopping sequence.');
    }
  };

  const handleDelete = async (contactId) => {
    if (window.confirm('Are you sure you want to delete this contact?')) {
      await deleteContact(contactId);
    }
  };

  const handleEdit = (contact) => {
    setIsEditing(contact.id);
    setEditFormData({ name: contact.name, email: contact.email });
  };

  const handleUpdate = async (contactId) => {
    await updateContact(contactId, { name: editFormData.name, email: editFormData.email });
    setIsEditing(null);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setCurrentPage(1); // Reset to first page on new search
    fetchContacts();
  };

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = contacts.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(contacts.length / itemsPerPage);

  const handleNextPage = () => {
      if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const handlePrevPage = () => {
      if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  // Reset pagination if total items become less than current page offset (e.g. after search delete)
  React.useEffect(() => {
    if (contacts.length > 0 && indexOfFirstItem >= contacts.length) {
      setCurrentPage(Math.max(1, Math.ceil(contacts.length / itemsPerPage)));
    }
  }, [contacts.length, indexOfFirstItem, itemsPerPage]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-effect rounded-xl p-6 border border-onyx-accent/20 shadow-xl"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 space-y-4 md:space-y-0">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-r from-sky-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
            <SafeIcon icon={FiUsers} className="text-white" />
          </div>
          <h2 className="text-lg font-semibold text-white">Contact Relationship Manager</h2>
        </div>
        <div className="flex items-center space-x-2">
            <span className="text-sm text-slate-400 bg-onyx-950/50 px-3 py-1 rounded-full border border-onyx-accent/20">
              Total: {contacts.length}
            </span>
            <button onClick={fetchContacts} className="p-2 bg-onyx-950/50 hover:bg-onyx-accent/20 rounded-lg transition-colors border border-onyx-accent/20 shadow-sm" aria-label="Refresh Contacts">
                <SafeIcon icon={FiRefreshCw} className={`text-slate-300 ${loading ? 'animate-spin' : ''}`} />
            </button>
        </div>
      </div>


      {/* Telemetry Leads Table */}
      <div className="mb-8">
        <h3 className="text-md font-semibold text-white mb-4">Recent Telemetry Leads (Nexus CRM)</h3>
        <div className="overflow-x-auto rounded-lg border border-onyx-accent/20 bg-onyx-950/30">
          <table className="w-full text-sm text-left text-slate-300">
            <thead className="text-xs text-slate-400 uppercase bg-onyx-950 border-b border-onyx-accent/20">
              <tr>
                <th scope="col" className="px-6 py-4 font-semibold tracking-wider">ID / Event</th>
                <th scope="col" className="px-6 py-4 font-semibold tracking-wider">Payload Details</th>
                <th scope="col" className="px-6 py-4 font-semibold tracking-wider">Created</th>
                <th scope="col" className="px-6 py-4 font-semibold tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {loadingLeads ? (
                <tr>
                  <td colSpan="4" className="text-center p-8 text-slate-500">
                    <SafeIcon icon={FiRefreshCw} className="animate-spin text-2xl mb-2 text-blue-500 inline" />
                    Loading telemetry leads...
                  </td>
                </tr>
              ) : telemetryLeads.length === 0 ? (
                <tr>
                  <td colSpan="4" className="p-8 text-center text-slate-500">
                    No recent telemetry leads found.
                  </td>
                </tr>
              ) : telemetryLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-onyx-accent/20 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-200">
                    {lead.id?.substring(0, 8)}...<br/>
                    <span className="text-xs text-slate-400">{lead.endpoint || 'N/A'}</span>
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    <pre className="text-xs max-w-xs overflow-x-auto">{JSON.stringify(lead.payload || {}, null, 2)}</pre>
                  </td>
                  <td className="px-6 py-4 text-slate-500 whitespace-nowrap">
                    {new Date(lead.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleAIQualify(lead)}
                      className="px-3 py-1.5 bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 hover:text-purple-300 rounded text-xs font-medium transition-colors border border-purple-700/50 mr-2"
                    >
                      AI Qualify
                    </button>
<button
                      onClick={() => handleOsintScan(lead)}
                      className="px-3 py-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 hover:text-blue-300 rounded text-xs font-medium transition-colors border border-blue-700/50"
                    >
                      OSINT Scan
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="Search contacts by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-onyx-950/50 border border-onyx-accent/20 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-inner placeholder-slate-500"
          />
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <SafeIcon icon={FiSearch} className="text-slate-400" />
          </div>
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-onyx-accent/20 bg-onyx-950/30">
        <table className="w-full text-sm text-left text-slate-300">
          <thead className="text-xs text-slate-400 uppercase bg-onyx-950 border-b border-onyx-accent/20">
            <tr>
              <th scope="col" className="px-6 py-4 font-semibold tracking-wider">Name</th>
              <th scope="col" className="px-6 py-4 font-semibold tracking-wider">Email</th>
              <th scope="col" className="px-6 py-4 font-semibold tracking-wider">Score</th>
              <th scope="col" className="px-6 py-4 font-semibold tracking-wider">Source</th>
              <th scope="col" className="px-6 py-4 font-semibold tracking-wider">Created</th>
              <th scope="col" className="px-6 py-4 font-semibold tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {loading ? (
              <tr>
                <td colSpan="6" className="text-center p-8">
                  <div className="flex flex-col items-center justify-center text-slate-500">
                      <SafeIcon icon={FiRefreshCw} className="animate-spin text-2xl mb-2 text-blue-500" />
                      Loading contacts...
                  </div>
                </td>
              </tr>
            ) : currentItems.length === 0 ? (
                <tr>
                    <td colSpan="6" className="p-8">
                        <div className="glass-effect p-8 rounded-xl border border-dashed border-onyx-accent/40 text-center flex flex-col items-center justify-center">
                            <SafeIcon icon={FiUsers} className="text-slate-500 text-4xl mb-4" />
                            <h3 className="text-lg font-semibold text-slate-300 mb-2">No Contacts Found</h3>
                            <p className="text-sm text-slate-500">
                                Ingest leads via the Action Panel to populate your Contact Relationship Manager.
                            </p>
                        </div>
                    </td>
                </tr>
            ) : currentItems.map((contact) => (
              <tr key={contact.id} className="hover:bg-onyx-accent/20 transition-colors group">
                {isEditing === contact.id ? (
                  <>
                    <td className="px-6 py-3">
                      <input
                        type="text"
                        value={editFormData.name}
                        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                        className="w-full bg-onyx-950 border border-onyx-accent/20 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-3 py-1.5 text-white transition-all outline-none"
                      />
                    </td>
                    <td className="px-6 py-3"></td>
                    <td className="px-6 py-3">
                      <input
                        type="email"
                        value={editFormData.email}
                        onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                        className="w-full bg-onyx-950 border border-onyx-accent/20 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded px-3 py-1.5 text-white transition-all outline-none"
                      />
                    </td>
                    <td className="px-6 py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-onyx-950 text-slate-400 border border-onyx-accent/20">
                            {contact.source}
                        </span>
                    </td>
                    <td className="px-6 py-3 text-slate-400 whitespace-nowrap">{new Date(contact.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-3 text-right space-x-2">
                      <button onClick={() => handleUpdate(contact.id)} className="px-3 py-1.5 bg-green-600/20 text-green-400 hover:bg-green-600/30 hover:text-green-300 rounded text-xs font-medium transition-colors border border-green-700/50">
                        Save
                      </button>
                      <button onClick={() => setIsEditing(null)} className="px-3 py-1.5 bg-onyx-950/50 text-slate-300 hover:bg-onyx-accent/20 hover:text-white rounded text-xs font-medium transition-colors border border-onyx-accent/20">
                        Cancel
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-6 py-4 font-medium text-slate-200">
                        <div className="flex items-center space-x-2">
                            <span>{contact.name}</span>
                            {enrollmentStatuses[contact.id] === 'active' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-900/50 text-blue-400 border border-blue-700/50">
                                    Active Sequence
                                </span>
                            )}
                        </div>
                    </td>
                    <td className="px-6 py-4 text-slate-400">{contact.email}</td>
                    <td className="px-6 py-4">
                        <div className="flex flex-col">
                            <span className={`font-semibold ${contact.lead_score >= 80 ? "text-green-400" : contact.lead_score >= 50 ? "text-yellow-400" : "text-slate-400"}`}>
                                {contact.lead_score !== null && contact.lead_score !== undefined ? contact.lead_score : "-"}
                            </span>
                            {contact.ai_summary && <span className="text-xs text-slate-500 max-w-[200px] truncate" title={contact.ai_summary}>{contact.ai_summary}</span>}
                        </div>
                    </td>
                    <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-onyx-950 text-slate-400 border border-onyx-accent/20">
                            {contact.source}
                        </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 whitespace-nowrap">{new Date(contact.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button aria-label={`AI Qualify ${contact.name}`} onClick={() => handleAIQualify(contact)} className="px-2 py-1 text-xs bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 hover:text-purple-300 rounded transition-colors border border-purple-700/50" title="AI Qualify">AI Qualify</button>
                            <div className="relative">
                                {enrollmentStatuses[contact.id] === 'active' ? (
                                    <button aria-label={`Stop Sequence ${contact.name}`} onClick={() => handleStopSequence(contact.id)} className="px-2 py-1 text-xs bg-red-600/20 text-red-400 hover:bg-red-600/30 hover:text-red-300 rounded transition-colors border border-red-700/50" title="Stop Sequence">
                                        Stop Sequence
                                    </button>
                                ) : (
                                    <>
                                        <button aria-label={`Enroll ${contact.name}`} onClick={() => setEnrollmentTarget(enrollmentTarget === contact.id ? null : contact.id)} className="px-2 py-1 text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 hover:text-blue-300 rounded transition-colors border border-blue-700/50" title="Enroll">Enroll</button>
                                        {enrollmentTarget === contact.id && (
                                            <div className="absolute right-0 mt-2 w-48 bg-onyx-900 border border-onyx-accent/20 rounded-md shadow-xl z-50">
                                                <div className="p-2 border-b border-onyx-accent/20 text-xs font-semibold text-slate-300">Select Sequence</div>
                                                <div className="max-h-40 overflow-y-auto">
                                                    {availableSequences.length > 0 ? availableSequences.map(seq => (
                                                        <button key={seq.id} onClick={() => handleEnrollLead(contact.id, seq.id)} className="w-full text-left px-3 py-2 text-sm text-slate-400 hover:bg-onyx-accent/20 hover:text-white transition-colors">
                                                            {seq.name}
                                                        </button>
                                                    )) : <div className="p-3 text-xs text-slate-500">No sequences available</div>}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <button aria-label={`View notes for ${contact.name}`} onClick={() => setSelectedContactForNotes(contact)} className="p-2 text-slate-400 hover:text-yellow-400 hover:bg-onyx-accent/20 rounded transition-colors" title="Notes">
                                <SafeIcon icon={FiMessageSquare} />
                            </button>
                            <button aria-label={`Edit contact ${contact.name}`} onClick={() => handleEdit(contact)} className="p-2 text-slate-400 hover:text-blue-400 hover:bg-onyx-accent/20 rounded transition-colors" title="Edit">
                                <SafeIcon icon={FiEdit} />
                            </button>
                            <button aria-label={`Delete contact ${contact.name}`} onClick={() => handleDelete(contact.id)} className="p-2 text-slate-400 hover:text-red-400 hover:bg-onyx-accent/20 rounded transition-colors" title="Delete">
                                <SafeIcon icon={FiTrash2} />
                            </button>
                        </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {contacts.length > itemsPerPage && (
          <div className="flex items-center justify-between mt-4 px-2">
             <div className="text-sm text-slate-500">
                 Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, contacts.length)} of {contacts.length} entries
             </div>
             <div className="flex space-x-2">
                 <button
                    onClick={handlePrevPage}
                    disabled={currentPage === 1}
                    className="px-3 py-1 bg-onyx-950 hover:bg-onyx-accent/20 disabled:opacity-50 disabled:cursor-not-allowed border border-onyx-accent/20 rounded text-sm text-slate-300 transition-colors"
                >
                     Previous
                 </button>
                 <button
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 bg-onyx-950 hover:bg-onyx-accent/20 disabled:opacity-50 disabled:cursor-not-allowed border border-onyx-accent/20 rounded text-sm text-slate-300 transition-colors"
                >
                     Next
                 </button>
             </div>
          </div>
      )}

      {selectedContactForNotes && (
        <ContactNotesModal
          contact={selectedContactForNotes}
          onClose={() => setSelectedContactForNotes(null)}
        />
      )}
    </motion.div>
  );
};

export default ContactManager;