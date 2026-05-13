import { useState } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID;

export default function PremiumUpgradeModal({ invitationId, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleUpgrade = async () => {
    setLoading(true);

    const loaded = await loadRazorpayScript();
    if (!loaded) {
      toast.error('Failed to load payment gateway. Check your internet connection.');
      setLoading(false);
      return;
    }

    try {
      const { data } = await api.post('/payments/create-order', { invitationId });

      const options = {
        key: RAZORPAY_KEY_ID,
        amount: data.amount,
        currency: data.currency,
        name: 'Invito',
        description: 'Premium Event Upgrade',
        order_id: data.orderId,
        handler: async (response) => {
          try {
            const verifyRes = await api.post('/payments/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              invitationId,
            });
            toast.success('🎉 Event upgraded to Premium!');
            onSuccess(verifyRes.data.invitation);
            onClose();
          } catch (err) {
            toast.error('Payment verification failed. Contact support.');
          }
        },
        prefill: {},
        theme: { color: '#4F46E5' },
        modal: {
          ondismiss: () => {
            setLoading(false);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', () => {
        toast.error('Payment failed. Please try again.');
        setLoading(false);
      });
      rzp.open();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to initiate payment.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">⭐</div>
          <h2 className="text-2xl font-bold text-gray-900">Upgrade to Premium</h2>
          <p className="text-gray-500 mt-2 text-sm">Your free event supports up to 50 guests.</p>
        </div>

        {/* Features */}
        <ul className="space-y-3 mb-8">
          {[
            'Unlimited guests — no cap',
            'Co-host management',
            'CSV guest list export',
            'Remove "Sent via Invito" watermark',
            'Priority badge in guest inbox',
          ].map((feature) => (
            <li key={feature} className="flex items-center gap-3 text-sm text-gray-700">
              <span className="text-green-500 font-bold text-base">✓</span>
              {feature}
            </li>
          ))}
        </ul>

        {/* Price */}
        <div className="bg-indigo-50 rounded-xl p-4 text-center mb-6">
          <span className="text-3xl font-bold text-indigo-700">₹419</span>
          <span className="text-gray-500 text-sm ml-2">one-time per event</span>
        </div>

        {/* Buttons */}
        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition disabled:opacity-60"
        >
          {loading ? 'Processing...' : 'Upgrade This Event — ₹419'}
        </button>
        <button
          onClick={onClose}
          className="w-full mt-3 py-3 text-gray-500 hover:text-gray-700 text-sm font-medium"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
