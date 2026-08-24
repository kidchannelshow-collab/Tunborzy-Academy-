import { motion, AnimatePresence } from 'motion/react';
import { Lock, Crown, RefreshCcw, PenTool, CheckCircle2, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useProfile } from '../../lib/useProfile';
import { supabase } from '../../supabaseClient';

interface PremiumFeaturesProps { onNavigate?: (view: string) => void; }

export default function PremiumFeatures({ onNavigate }: PremiumFeaturesProps) {
  const { profile } = useProfile();
  const [showModal, setShowModal] = useState(false);
  const [paying, setPaying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  const isPremium = profile?.premium_status === 'Active' || profile?.premium_status === 'Premium' || profile?.premium_status === 'Pro';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment_status');
    const txRef = params.get('tx_ref');
    if (paymentStatus === 'success' && txRef) {
      setShowModal(true);
      verifyCallbackPayment(txRef, params.get('transaction_id'));
    }
  }, []);

  const verifyCallbackPayment = async (reference: string, transactionId?: string | null) => {
    setPaying(true);
    setSuccessMsg('Verifying your payment with Flutterwave...');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated.');

      const res = await fetch('/api/payments/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          reference,
          transactionId: transactionId || `tx_${Date.now()}`,
          amount: 5000.00,
          plan: 'premium'
        })
      });

      const text = await res.text();
      let data = JSON.parse(text);
      if (!res.ok) throw new Error(data.error || 'Payment verification failed');

      setSuccessMsg('Premium successfully activated!');
      window.history.replaceState({}, document.title, window.location.pathname);
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'Verification error');
    } finally {
      setPaying(false);
    }
  };

  const handleActivatePremium = async () => {
    setPaying(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        throw new Error('Not authenticated. Please sign in again.');
      }

      const initRes = await fetch('/api/payments/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: 5000.00,
          plan: 'premium'
        })
      });

      const initText = await initRes.text();
      let initData;
      try {
        initData = JSON.parse(initText);
      } catch (e) {
        throw new Error('Server returned invalid response. Please try again.');
      }
      if (!initRes.ok) throw new Error(initData.error || 'Payment initialization failed');

      if (initData.payment_link) {
        setSuccessMsg('Opening Flutterwave secure checkout in a new tab...');
        // Open in new tab to avoid iframe sandbox restrictions
        const newWindow = window.open(initData.payment_link, '_blank');
        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
          // Fallback if popup blocked
          if (confirm('Popup blocked! Click OK to open payment checkout in this window.')) {
            window.location.href = initData.payment_link;
          }
        }
        setPaying(false);
        return;
      }

      const reference = initData.reference || `FLW_TX_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      
      const res = await fetch('/api/payments/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          reference,
          transactionId: `tx_${Date.now()}`,
          amount: 5000.00,
          plan: 'premium'
        })
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error('Server returned invalid response during verification.');
      }
      if (!res.ok) throw new Error(data.error || 'Payment verification failed');

      setSuccessMsg('Premium successfully activated!');
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Payment processing error');
    } finally {
      setPaying(false);
    }
  };

  const lockedFeatures = [
    { title: 'Revision Mode', icon: RefreshCcw, desc: 'Smart spaced repetition for better retention.', id: 'revision' },
    { title: 'Premium CBT', icon: PenTool, desc: 'Full-length timed mock exams with analytics.', id: 'cbt' },
  ];

  return (
    <>
      <div className="mb-10">
        <h3 className="text-lg font-display font-bold text-white mb-4 flex items-center gap-2">
          <Crown size={20} className="text-amber-500" />
          Premium Features
        </h3>

        {/* Premium Membership Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 rounded-2xl bg-gradient-to-br from-amber-500/10 to-amber-700/10 border border-amber-500/20 p-6 md:p-8 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 border border-amber-500/30 shadow-inner relative">
                <Crown size={24} className="text-amber-500" />
              </div>
              <div>
                <h4 className="text-xl font-display font-bold text-white mb-1 tracking-tight">Premium Access</h4>
                <p className="text-sm font-body text-slate-300 mb-4 max-w-md leading-relaxed">
                  Unlock all premium learning resources, advanced analytics, and exclusive mentorship.
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-poppins font-medium text-slate-400 uppercase tracking-wider">Premium Status:</span>
                  {isPremium ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider border border-emerald-500/20">
                      <CheckCircle2 size={14} />
                      Activated
                    </span>
                  ) : (
                    <span 
                       
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 text-xs font-bold uppercase tracking-wider border border-slate-700 select-none"
                    >
                      Not Activated
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="shrink-0 w-full md:w-auto">
              {isPremium ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-[#0f172a]/80 backdrop-blur-md rounded-xl p-4 border border-slate-700/50 min-w-[240px] shadow-xl"
                >
                  <div className="flex items-center justify-between mb-3 border-b border-slate-700/50 pb-3">
                    <span className="text-xs font-poppins font-semibold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                      <CheckCircle2 size={14} className="text-emerald-500" />
                      Premium Active
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400 flex items-center gap-1.5 font-body">Status:</span>
                      <span className="text-amber-500 font-medium font-poppins">Fully Unlocked</span>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="space-y-2">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    disabled={paying}
                    onClick={handleActivatePremium}
                    className="w-full md:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 text-slate-950 font-action font-bold shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:shadow-[0_0_30px_rgba(245,158,11,0.4)] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {paying ? <Loader2 size={18} className="animate-spin" /> : <Crown size={18} />}
                    {paying ? 'Verifying Payment...' : 'Activate Premium (₦5,000)'}
                  </motion.button>
                  {errorMsg && <div className="text-xs text-rose-400 font-medium text-center">{errorMsg}</div>}
                  {successMsg && <div className="text-xs text-emerald-400 font-medium text-center">{successMsg}</div>}
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Locked Features Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {lockedFeatures.map((feature, index) => (
            <motion.div 
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={!isPremium ? { y: -5 } : { y: -5, boxShadow: "0 10px 30px -10px rgba(0,0,0,0.5)" }}
              onClick={() => { if (onNavigate) onNavigate(feature.id); }}
              className={`relative overflow-hidden rounded-2xl bg-[#0f172a]/80 backdrop-blur-md border border-slate-800 p-6 shadow-lg ${!isPremium ? 'cursor-pointer group' : ''}`}
            >
              {!isPremium && (
                <div className="absolute inset-0 bg-[#020617]/50 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="w-12 h-12 rounded-full bg-slate-900/90 border border-slate-700 flex items-center justify-center mb-2 shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                    <Lock size={20} className="text-amber-500" />
                  </div>
                  <span className="text-xs font-action font-semibold text-white tracking-widest uppercase transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 delay-75">
                    Unlock Feature
                  </span>
                </div>
              )}

              <div className={`relative z-0 ${!isPremium ? 'opacity-60 grayscale-[40%] transition-all duration-300 group-hover:blur-sm' : ''}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-800/80 flex items-center justify-center shadow-inner">
                    <feature.icon size={24} className="text-amber-500" />
                  </div>
                  {!isPremium && (
                    <div className="w-8 h-8 rounded-full bg-slate-900/50 flex items-center justify-center border border-slate-800">
                      <Lock size={14} className="text-slate-500" />
                    </div>
                  )}
                </div>
                <h4 className="text-lg font-display font-bold text-white mb-2">{feature.title}</h4>
                <p className="text-sm font-body text-slate-400 line-clamp-2 leading-relaxed">{feature.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Premium Upgrade Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="absolute inset-0 bg-[#020617]/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative z-10 w-full max-w-md bg-[#0f172a] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl"
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-br from-amber-500/10 to-slate-900/50 px-6 py-8 text-center relative border-b border-slate-800">
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/3"></div>
                <div className="w-16 h-16 rounded-full bg-[#0f172a] border-2 border-amber-500/30 flex items-center justify-center mx-auto mb-4 relative z-10 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
                  <Crown size={32} className="text-amber-500" />
                </div>
                <h3 className="text-2xl font-display font-bold text-white mb-2 relative z-10 tracking-tight">Premium Feature</h3>
                <p className="text-sm font-body text-slate-300 relative z-10 leading-relaxed max-w-[280px] mx-auto">
                  This feature is available to Premium members. Upgrade to Premium via Flutterwave to unlock full access.
                </p>
              </div>
              
              {/* Modal Body */}
              <div className="p-6">
                <div className="flex flex-col sm:flex-row gap-3">
                  <button 
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-3.5 rounded-xl border border-slate-700 text-slate-300 font-action font-semibold hover:bg-slate-800 hover:text-white transition-colors"
                  >
                    Close
                  </button>
                  <button 
                    onClick={() => {
                      // TODO: Implement Flutterwave payment modal here
                      alert('Flutterwave payment integration pending.');
                    }}
                    className="flex-1 px-4 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-action font-bold transition-colors flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                  >
                    Upgrade Now
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
