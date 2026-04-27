import React, { useState, useEffect } from 'react';
import { supabaseClient } from '../../services/supabaseClient';

const AffiliateManager = () => {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    partner_name: '',
    category: '',
    custom_link: '',
    context_description: '',
    status: 'active'
  });

  const fetchPartners = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseClient
        .from('affiliate_partners')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPartners(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPartners();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data, error } = await supabaseClient
        .from('affiliate_partners')
        .insert([formData]);

      if (error) throw error;

      setFormData({
        partner_name: '',
        category: '',
        custom_link: '',
        context_description: '',
        status: 'active'
      });
      setIsModalOpen(false);
      fetchPartners();
    } catch (err) {
      console.error("Error adding affiliate partner:", err);
      alert("Failed to add partner: " + err.message);
    }
  };

  return (
    <div className="p-6 bg-slate-900 min-h-screen text-slate-200">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white">Affiliate Partner Management</h1>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium transition-colors"
          >
            New Partner
          </button>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-200 p-4 rounded mb-6">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-slate-400">Loading partners...</div>
        ) : (
          <div className="bg-slate-800 rounded-lg overflow-hidden shadow-xl border border-slate-700">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/50 text-slate-300 text-sm uppercase tracking-wider">
                    <th className="p-4 border-b border-slate-700">Name</th>
                    <th className="p-4 border-b border-slate-700">Category</th>
                    <th className="p-4 border-b border-slate-700">Link</th>
                    <th className="p-4 border-b border-slate-700">Context</th>
                    <th className="p-4 border-b border-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {partners.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="p-4 text-center text-slate-500">
                        No affiliate partners found.
                      </td>
                    </tr>
                  ) : (
                    partners.map((partner) => (
                      <tr key={partner.id} className="hover:bg-slate-750 transition-colors">
                        <td className="p-4 font-medium text-white">{partner.partner_name}</td>
                        <td className="p-4 text-emerald-400 text-sm">
                          <span className="bg-emerald-400/10 px-2 py-1 rounded">
                            {partner.category}
                          </span>
                        </td>
                        <td className="p-4 text-sm max-w-xs truncate" title={partner.custom_link}>
                          <a href={partner.custom_link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                            {partner.custom_link}
                          </a>
                        </td>
                        <td className="p-4 text-sm text-slate-400 max-w-sm truncate" title={partner.context_description}>
                          {partner.context_description}
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            partner.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                            {partner.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal for New Partner */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-md border border-slate-700 overflow-hidden">
              <div className="p-6 border-b border-slate-700">
                <h2 className="text-xl font-bold text-white">Add Affiliate Partner</h2>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Partner Name</label>
                  <input
                    type="text"
                    name="partner_name"
                    value={formData.partner_name}
                    onChange={handleInputChange}
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                    placeholder="e.g., beehiiv"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Category</label>
                  <input
                    type="text"
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                    placeholder="e.g., email_newsletter"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Custom Tracking Link</label>
                  <input
                    type="url"
                    name="custom_link"
                    value={formData.custom_link}
                    onChange={handleInputChange}
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">AI Context Description</label>
                  <textarea
                    name="context_description"
                    value={formData.context_description}
                    onChange={handleInputChange}
                    required
                    rows={3}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none resize-none"
                    placeholder="Why should the AI recommend this tool? e.g., A modern, high-deliverability email newsletter platform..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Status</label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-slate-700 mt-6">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium transition-colors"
                  >
                    Save Partner
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AffiliateManager;
