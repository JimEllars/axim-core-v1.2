import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../services/onyxAI/api';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { useAuth } from '../../contexts/AuthContext';

const { FiX, FiPlus, FiTrash2, FiMessageSquare } = FiIcons;

const ContactNotesModal = ({ contact, onClose }) => {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchNotes = useCallback(async () => {
    if (!contact) return;
    setLoading(true);
    try {
      const fetchedNotes = await api.getNotesForContact(contact.id);
      setNotes(fetchedNotes);
    } catch (error) {
      toast.error('Failed to fetch notes.');
    } finally {
      setLoading(false);
    }
  }, [contact]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    try {
      await api.createNote(contact.id, newNote, user.id);
      toast.success('Note added successfully.');
      setNewNote('');
      fetchNotes(); // Refresh notes list
    } catch (error) {
      toast.error('Failed to add note.');
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (window.confirm('Are you sure you want to delete this note?')) {
      try {
        await api.deleteNote(noteId);
        toast.success('Note deleted successfully.');
        fetchNotes(); // Refresh notes list
      } catch (error) {
        toast.error('Failed to delete note.');
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="glass-effect rounded-xl w-full max-w-2xl mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-onyx-accent/20 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white">Notes for {contact.name}</h2>
            <p className="text-sm text-slate-400">{contact.email}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-onyx-accent/20">
            <SafeIcon icon={FiX} />
          </button>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center items-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <AnimatePresence>
              {notes.length > 0 ? (
                <ul className="space-y-4">
                  {notes.map((note) => (
                    <motion.li
                      key={note.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="bg-onyx-950/60 p-4 rounded-lg flex items-start justify-between"
                    >
                      <div>
                        <p className="text-slate-200 whitespace-pre-wrap">{note.content}</p>
                        <p className="text-xs text-slate-500 mt-2">
                          {new Date(note.created_at).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                        aria-label="delete note"
                      >
                        <SafeIcon icon={FiTrash2} />
                      </button>
                    </motion.li>
                  ))}
                </ul>
              ) : (
                <div className="text-center py-12 text-slate-500">
                   <SafeIcon icon={FiMessageSquare} className="mx-auto text-4xl mb-4" />
                  <p>No notes found for this contact.</p>
                </div>
              )}
            </AnimatePresence>
          )}
        </div>

        <form onSubmit={handleAddNote} className="p-6 border-t border-onyx-accent/20">
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a new note..."
            className="w-full bg-onyx-950/50 border border-onyx-accent/20 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500"
            rows="3"
          />
          <div className="flex justify-end mt-4">
            <motion.button
              type="submit"
              disabled={!newNote.trim()}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <SafeIcon icon={FiPlus} className="inline mr-2" />
              Add Note
            </motion.button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default ContactNotesModal;
