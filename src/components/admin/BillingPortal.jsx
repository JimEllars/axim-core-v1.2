import React, { useEffect, useState } from 'react';
import { useSupabase } from '../../contexts/SupabaseContext';
import { useAuth } from '../../contexts/AuthContext';
import { FiCreditCard, FiCheckCircle, FiAlertCircle, FiAlertTriangle, FiPlus } from 'react-icons/fi';
import toast from 'react-hot-toast';
import config from '../../config';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const BillingPortal = () => {
  const { supabase } = useSupabase();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [topUpAmount, setTopUpAmount] = useState(100);

  // Use configuration for price ID, fallback to a sensible default or placeholder
  const STRIPE_PRICE_ID = config.stripePriceId || 'price_1234567890';
  const isDemoMode = STRIPE_PRICE_ID === 'price_1234567890';

  useEffect(() => {
    if (user) {
      fetchSubscription();
    }
  }, [user]);

  const fetchSubscription = async () => {
    try {
      const { data, error } = await supabase
        .from('subscriptions_ax2024')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      setSubscription(data);
    } catch (error) {
      console.error('Error fetching subscription:', error);
      toast.error('Failed to load subscription details.');
    } finally {
      setLoading(false);
    }
  };

  const { data: partnerCredit, isLoading: isLoadingCredits } = useQuery({
    queryKey: ['partner_credits', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partner_credits')
        .select('*')
        .eq('partner_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user
  });

  const topUpMutation = useMutation({
    mutationFn: async (amount) => {
      let currentCredits = partnerCredit?.credits_remaining || 0;
      const { data, error } = await supabase
        .from('partner_credits')
        .upsert(
          { partner_id: user.id, credits_remaining: currentCredits + amount },
          { onConflict: 'partner_id' }
        );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(`Successfully added ${topUpAmount} credits.`);
      queryClient.invalidateQueries({ queryKey: ['partner_credits', user.id] });
    },
    onError: (error) => {
      toast.error(`Failed to add credits: ${error.message}`);
    }
  });

  const handleTopUp = () => {
    if (topUpAmount <= 0) {
      toast.error('Amount must be greater than 0');
      return;
    }
    topUpMutation.mutate(Number(topUpAmount));
  };

  const handleSubscribe = async (priceId) => {
    if (isDemoMode) {
        toast((t) => (
            <span>
                <b>Demo Mode Active</b><br/>
                Stripe Price ID is not configured. Checkout will likely fail.
            </span>
        ), {
            id: 'billing-demo-mode',
            icon: '⚠️',
            duration: 4000
        });
    }

    toast('Redirecting to checkout...', { icon: '💳' });
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { priceId, returnUrl: window.location.origin + '/admin/billing' }
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned. Check backend logs.');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      toast.error(`Failed to start checkout: ${error.message}`);
    }
  };

  const handleManageSubscription = async () => {
    if (isDemoMode) {
      toast.error('Demo Mode: Cannot open customer portal.');
      return;
    }

    toast('Opening customer portal...', { icon: '⚙️' });
    try {
      const { data, error } = await supabase.functions.invoke('create-portal-session', {
        body: { returnUrl: window.location.origin + '/admin/billing' }
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No portal URL returned.');
      }
    } catch (error) {
       console.error('Error opening portal:', error);
       toast.error(`Failed to open portal: ${error.message}`);
    }
  };

  if (loading) {
    return <div className="p-8 text-white">Loading billing information...</div>;
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Billing & Subscription</h2>
          <p className="text-slate-400">Manage your plan and payment methods.</p>
        </div>
        {isDemoMode && (
             <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg px-4 py-2 flex items-center text-yellow-200 text-sm">
                 <FiAlertTriangle className="mr-2" />
                 <span>Demo Mode: Payments Disabled</span>
             </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Current Plan Status */}
        <div className="bg-onyx-950/50 backdrop-blur-md rounded-xl p-6 border border-onyx-accent/20">
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
            <FiCheckCircle className="mr-2 text-green-400" />
            Current Status
          </h3>
          {subscription ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-4 border-b border-onyx-accent/20">
                <span className="text-slate-400">Status</span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  subscription.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {subscription.status.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between items-center pb-4 border-b border-onyx-accent/20">
                <span className="text-slate-400">Plan</span>
                <span className="text-white font-medium">{subscription.plan_id || 'Pro Plan'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Renews</span>
                <span className="text-white">{subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : 'N/A'}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-slate-400 mb-4">No active subscription found.</p>
              <button
                onClick={() => handleSubscribe(STRIPE_PRICE_ID)}
                className={`px-4 py-2 text-white rounded-lg transition-colors ${isDemoMode ? 'bg-onyx-950 hover:bg-onyx-accent/10 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}`}
                // disabled={isDemoMode} // Allow clicking to see the toast, but visually indicate it might be limited
              >
                Upgrade to Pro
              </button>
            </div>
          )}
        </div>

        {/* API Credits Section */}
        <div className="bg-onyx-950/50 backdrop-blur-md rounded-xl p-6 border border-onyx-accent/20">
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
            <FiPlus className="mr-2 text-blue-400" />
            B2B Partner API Credits
          </h3>
          <div className="flex items-center justify-between p-4 bg-onyx-900/50 rounded-lg border border-onyx-accent/20 mb-4">
            <span className="text-slate-300 font-medium">Remaining Credits:</span>
            <span className="text-2xl font-bold text-green-400">
              {isLoadingCredits ? '...' : (partnerCredit?.credits_remaining || 0)}
            </span>
          </div>

          <div className="space-y-4">
            <label className="block text-sm text-slate-400">Manual Credit Top-up (Admin)</label>
            <div className="flex gap-2">
              <input
                type="number"
                className="input input-bordered w-full bg-onyx-950"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                min="1"
              />
              <button
                className="btn btn-primary"
                onClick={handleTopUp}
                disabled={topUpMutation.isPending}
              >
                Top Up
              </button>
            </div>
          </div>
        </div>

        {/* Payment Methods (Placeholder) */}
        <div className="bg-onyx-950/50 backdrop-blur-md rounded-xl p-6 border border-onyx-accent/20">
           <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
            <FiCreditCard className="mr-2 text-blue-400" />
            Payment Method
          </h3>
          <div className="flex items-center justify-between p-4 bg-onyx-950/50 rounded-lg border border-onyx-accent/20 mb-4">
            <div className="flex items-center space-x-3">
               <div className="w-10 h-6 bg-onyx-950 rounded"></div>
               <span className="text-slate-300">•••• 4242</span>
            </div>
             <span className="text-xs text-slate-500">Expires 12/25</span>
          </div>
          <button
            onClick={handleManageSubscription}
            disabled={!subscription}
            className={`text-sm transition-colors ${!subscription ? 'text-slate-600 cursor-not-allowed' : 'text-purple-400 hover:text-purple-300'}`}
          >
            Manage via Stripe Portal
          </button>
        </div>
      </div>
    </div>
  );
};

export default BillingPortal;
