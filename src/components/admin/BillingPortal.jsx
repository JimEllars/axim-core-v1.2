import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../services/supabaseClient';
import * as FiIcons from 'react-icons/fi';

const { FiBox, FiCheckCircle, FiClock, FiXCircle, FiAlertTriangle } = FiIcons;

const BillingPortal = () => {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDeliveries = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('product_deliveries')
        .select(`
          *,
          digital_products (
            title,
            price
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching deliveries:', error);
      } else {
        setDeliveries(data || []);
      }
    } catch (err) {
      console.error('Failed to load deliveries:', err);
    } finally {
      setLoading(false);
    }
  };


  const handleInvoiceAction = async (deliveryId, actionType) => {
    try {
      await supabase.from('api_usage_logs').insert({
        app_id: 'admin_cockpit',
        endpoint: `/admin/billing/${actionType}`,
        status_code: 200,
        compute_ms: 0,
        metadata: { action: actionType, delivery_id: deliveryId }
      });
      // Stub action completion
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {

    fetchDeliveries();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('public:product_deliveries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_deliveries' }, payload => {
        fetchDeliveries(); // Refetch to get joined data, or manually update state
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'delivered':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <FiCheckCircle className="mr-1" /> Delivered
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            <FiClock className="mr-1" /> Pending
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            <FiXCircle className="mr-1" /> Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400">
            {status}
          </span>
        );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 min-h-[160px]" style={{ background: 'rgba(10, 10, 12, 0.45)', backdropFilter: 'blur(16px)' }}
    >
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center">
            <FiBox className="mr-2 text-blue-500" /> Fulfillment Pipeline
          </h2>
          <p className="text-slate-400 text-sm mt-1">Real-time visibility into digital product deliveries.</p>
        </div>
      </div>

      {deliveries.some(d => d.delivery_status === 'failed') && (
        <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-6 flex items-start">
          <FiAlertTriangle className="text-red-500 mt-1 mr-3 flex-shrink-0" />
          <div>
            <h3 className="text-red-400 font-semibold">Delivery Failures Detected</h3>
            <p className="text-red-300 text-sm mt-1">One or more product deliveries have failed. Please review the pipeline below.</p>
          </div>
        </div>
      )}

      <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-800/50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Product</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Recipient Email</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Created At</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-slate-900/30 divide-y divide-slate-800">
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <tr key={`skeleton-${i}`} className="animate-pulse bg-slate-900/30">
                    <td className="px-6 py-4"><div className="h-4 bg-slate-700/50 rounded w-3/4"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-700/50 rounded w-1/2"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-700/50 rounded w-1/4"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-700/50 rounded w-1/3"></div></td>
                    <td className="px-6 py-4"></td>
                  </tr>
                ))
              ) : deliveries.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-8 text-center text-slate-500">
                    No product deliveries found.
                  </td>
                </tr>
              ) : (
                deliveries.map((delivery) => (
                  <tr key={delivery.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-slate-200">
                        {delivery.digital_products?.title || 'Unknown Product'}
                      </div>
                      <div className="text-xs text-slate-500">
                        ${delivery.digital_products?.price || '0.00'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-300">{delivery.recipient_email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(delivery.delivery_status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                      {new Date(delivery.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button onClick={() => handleInvoiceAction(delivery.id, 'resend_invoice')} className="text-indigo-400 hover:text-indigo-300">
                        Resend Invoice
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
};

export default BillingPortal;
