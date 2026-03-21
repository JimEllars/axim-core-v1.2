/**
 * Shared AXiM Core Payment Verification Logic
 *
 * This module abstracts the payment verification logic (previously in usePayment.js)
 * into a shared library that can be used across all micro apps and the AXiM Core.
 *
 * It provides a standardized way to interface with the universal billing engine
 * for checking payment intents and verifying transaction completions.
 */

import config from '../../config.js';

/**
 * Validates a payment intent with the AXiM Core billing engine.
 *
 * @param {string} paymentIntentId - The ID of the Stripe Payment Intent to verify.
 * @param {string} partnerKey - (Optional) Partner API key for bulk credit usage.
 * @returns {Promise<Object>} - The verification result from the backend.
 */
export const verifyPaymentIntent = async (paymentIntentId, partnerKey = null) => {
  if (!paymentIntentId) {
    throw new Error('paymentIntentId is required for verification.');
  }

  const endpoint = `${config.apiBaseUrl || 'http://localhost:8080'}/payments/verify`;

  const headers = {
    'Content-Type': 'application/json',
  };

  if (partnerKey) {
    headers['Authorization'] = `Bearer ${partnerKey}`;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ paymentIntentId })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Payment verification failed.');
    }

    return await response.json();
  } catch (error) {
    console.error('Error verifying payment intent:', error);
    throw error;
  }
};

/**
 * Creates a new payment intent via the AXiM Core billing engine.
 * This replaces standalone Stripe logic in individual micro apps.
 *
 * @param {Object} details - The payment details (amount, currency, microAppId).
 * @param {string} partnerKey - (Optional) Partner API key for bulk credit deduction.
 * @returns {Promise<Object>} - The created payment intent data (e.g., clientSecret).
 */
export const createPaymentIntent = async (details, partnerKey = null) => {
  const endpoint = `${config.apiBaseUrl || 'http://localhost:8080'}/payments/intent`;

  const headers = {
    'Content-Type': 'application/json',
  };

  if (partnerKey) {
    headers['Authorization'] = `Bearer ${partnerKey}`;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(details)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create payment intent.');
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating payment intent:', error);
    throw error;
  }
};
