import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Users, Tag, Award, Plus, Sparkles, ChevronRight, X, Phone, Mail, DollarSign, 
  Shield, CheckCircle2, AlertCircle, Copy, Check, TrendingUp, BarChart3, 
  Filter, Search, RefreshCw, Clock, UserCheck, UserX, Ban, Play, ArrowUpRight
} from 'lucide-react';
import { supabase } from '../../supabaseClient';

/**
 * Every value `profiles.premium_status` can hold for a CURRENTLY premium user.
 * `/api/payments/verify` writes 'Active'; 'Premium'/'Pro' are kept for older
 * rows and other code paths. This is the single definition of "is this user
 * premium right now" — a past payment is deliberately NOT part of it, so a
 * cancelled or expired subscription stops counting.
 */
const PREMIUM_STATUSES = ['Active', 'Premium', 'Pro'];

interface Partner {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  referral_code: string;
  commission_percentage: number;
  status: string; // 'active' | 'pending' | 'suspended' | 'rejected' | 'inactive'
  created_at: string;
  /** Total people who signed up with this partner's code. NOT paying users. */
  referred_count?: number;
  /** Referred users whose subscription is currently active. */
  premium_count?: number;
  /** Referred users with a live commission entry — the ones that earned. */
  qualifying_count?: number;
  conversion_rate?: number;
  commission_earned?: number;
  commission_paid?: number;
  commission_available?: number;
}

export default function PartnershipManagement() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  // Page-level load failure. Without this a failed query left `partners` empty
  // and the UI rendered "No partners found." — indistinguishable from a partner
  // list that is genuinely empty.
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  
  // Detailed view tabs for selected partner
  const [partnerTab, setPartnerTab] = useState<'overview' | 'referrals' | 'commissions' | 'activity'>('overview');
  const [referredUsers, setReferredUsers] = useState<any[]>([]);
  const [commissionLedger, setCommissionLedger] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Search, Filter, Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'referrals' | 'conversions' | 'earnings'>('newest');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Add Partner Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [commissionPct, setCommissionPct] = useState('20');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Confirmation modal state
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    action: () => Promise<void>;
  } | null>(null);

  // Copied state for links
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    fetchPartners();

    // Realtime Supabase subscription
    const channel = supabase
      .channel('admin-partnerships-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partners' }, () => {
        fetchPartners();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchPartners();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partner_commission_ledger' }, () => {
        fetchPartners();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchPartners = async () => {
    if (!supabase) return;
    setLoading(true);
    setFetchError(null);
    try {
      // 1. Fetch partners
      const { data: partnersData, error: partnersErr } = await supabase
        .from('partners')
        .select('*')
        .order('created_at', { ascending: false });

      if (partnersErr) throw partnersErr;

      // 2. Fetch profiles for referral counts
      const { data: profilesData, error: profilesErr } = await supabase
        .from('profiles')
        .select('id, referred_by_partner_id, premium_status, created_at');

      if (profilesErr) throw profilesErr;

      // 3. Fetch the commission ledger. `referred_user_id` is needed to count
      //    distinct qualifying users rather than qualifying payments.
      const { data: ledgerData, error: ledgerErr } = await supabase
        .from('partner_commission_ledger')
        .select('partner_id, referred_user_id, commission_amount, status');

      // A failure here would render every partner as having converted nobody and
      // earned nothing — wrong numbers presented as real ones, which is worse
      // than an error. Surfaced instead.
      if (ledgerErr) throw ledgerErr;

      // Aggregate metrics per partner
      const referredCounts = new Map<string, number>();
      const premiumCounts = new Map<string, number>();
      const earnedMap = new Map<string, number>();
      const paidMap = new Map<string, number>();
      const qualifyingUsers = new Map<string, Set<string>>();

      (profilesData || []).forEach((p: any) => {
        if (p.referred_by_partner_id) {
          const current = referredCounts.get(p.referred_by_partner_id) || 0;
          referredCounts.set(p.referred_by_partner_id, current + 1);

          // Premium status is taken from `profiles.premium_status` ALONE — the
          // current subscription state. A previous version also counted anyone
          // with a successful `payments` row, which meant a referred user who
          // paid once and then cancelled or expired stayed a Premium referral
          // forever. `payment_status` is the subscription rule, so it decides.
          const isPremium = !!p.premium_status && PREMIUM_STATUSES.includes(p.premium_status);
          if (isPremium) {
            const pCurrent = premiumCounts.get(p.referred_by_partner_id) || 0;
            premiumCounts.set(p.referred_by_partner_id, pCurrent + 1);
          }
        }
      });

      (ledgerData || []).forEach((item: any) => {
        // 'cancelled' entries are a reversed payment and must not count as a
        // qualifying referral or as earnings.
        if (item.status !== 'cancelled' && item.referred_user_id) {
          if (!qualifyingUsers.has(item.partner_id)) qualifyingUsers.set(item.partner_id, new Set());
          qualifyingUsers.get(item.partner_id)!.add(item.referred_user_id);
        }
        if (item.status === 'approved' || item.status === 'paid') {
          const currentEarned = earnedMap.get(item.partner_id) || 0;
          earnedMap.set(item.partner_id, currentEarned + Number(item.commission_amount || 0));
        }
        if (item.status === 'paid') {
          const currentPaid = paidMap.get(item.partner_id) || 0;
          paidMap.set(item.partner_id, currentPaid + Number(item.commission_amount || 0));
        }
      });

      const enriched = (partnersData || []).map((pt: any) => {
        const referred = referredCounts.get(pt.id) || 0;
        const premium = premiumCounts.get(pt.id) || 0;
        const conversionRate = referred > 0 ? Number(((premium / referred) * 100).toFixed(1)) : 0;
        const earned = earnedMap.get(pt.id) || 0;
        const paid = paidMap.get(pt.id) || 0;
        const available = Math.max(0, earned - paid);

        return {
          ...pt,
          status: pt.status || 'active',
          referred_count: referred,
          premium_count: premium,
          // Distinct referred users with a live (non-cancelled) commission
          // entry — i.e. Premium referrals that actually qualified for a
          // reward. Counted as a Set so a renewal or a repeat payment event
          // cannot count the same user twice.
          qualifying_count: qualifyingUsers.get(pt.id)?.size || 0,
          conversion_rate: conversionRate,
          commission_earned: earned,
          commission_paid: paid,
          commission_available: available,
          // `clicks_count` was removed. It was `referred * 12 + 45` — a made-up
          // "realistic estimation" with no click-tracking table behind it, shown
          // in the partner detail panel as if it were measured. Nothing in the
          // schema records referral-link clicks, so the card reports that
          // instead of inventing a figure.
        };
      });

      setPartners(enriched);
    } catch (err: any) {
      console.error('Error fetching partners:', err);
      setFetchError(err?.message || 'Could not load partners from the database.');
      setPartners([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPartner = async (partner: Partner) => {
    setSelectedPartner(partner);
    setPartnerTab('overview');
    setLoadingDetails(true);
    try {
      // Fetch referred users for this partner
      const { data: usersData, error: usersErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, created_at, role, premium_status, payment_reference, payment_date')
        .eq('referred_by_partner_id', partner.id)
        .order('created_at', { ascending: false });

      if (usersErr) throw usersErr;
      setReferredUsers(usersData || []);

      // Fetch commission ledger entries
      const { data: ledgerData, error: ledgerErr } = await supabase
        .from('partner_commission_ledger')
        .select('*')
        .eq('partner_id', partner.id)
        .order('created_at', { ascending: false });

      if (ledgerErr) throw ledgerErr;
      setCommissionLedger(ledgerData || []);
    } catch (err: any) {
      console.error('Error fetching partner details:', err);
      setReferredUsers([]);
      setCommissionLedger([]);
    } finally {
      setLoadingDetails(false);
    }
  };

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'REF';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setReferralCode(code);
  };

  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!fullName.trim() || !email.trim() || !referralCode.trim()) {
      setErrorMsg('Full Name, Email, and Referral Code are required.');
      return;
    }

    setSubmitting(true);
    try {
      const cleanCode = referralCode.trim().toUpperCase();

      const { data: existing, error: checkErr } = await supabase
        .from('partners')
        .select('id')
        .eq('referral_code', cleanCode)
        .maybeSingle();

      if (checkErr) throw checkErr;
      if (existing) {
        setErrorMsg(`Referral code "${cleanCode}" is already in use by another partner.`);
        setSubmitting(false);
        return;
      }

      const { error: insertErr } = await supabase
        .from('partners')
        .insert([{
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || null,
          referral_code: cleanCode,
          commission_percentage: parseFloat(commissionPct) || 20.00,
          status: 'active'
        }]);

      if (insertErr) throw insertErr;

      setSuccessMsg('Partner registered successfully!');
      setFullName('');
      setEmail('');
      setPhone('');
      setReferralCode('');
      setCommissionPct('20');
      setShowAddModal(false);
      fetchPartners();
    } catch (err: any) {
      console.error('Error creating partner:', err);
      setErrorMsg(err.message || 'Failed to create partner.');
    } finally {
      setSubmitting(false);
    }
  };

  const updatePartnerStatus = async (partnerId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('partners')
        .update({ status: newStatus })
        .eq('id', partnerId);

      if (error) throw error;
      
      if (selectedPartner && selectedPartner.id === partnerId) {
        setSelectedPartner({ ...selectedPartner, status: newStatus });
      }
      fetchPartners();
      setConfirmAction(null);
    } catch (err: any) {
      console.error('Error updating partner status:', err);
      alert(err.message || 'Failed to update partner status.');
    }
  };

  const updateCommissionStatus = async (ledgerId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('partner_commission_ledger')
        .update({ status: newStatus })
        .eq('id', ledgerId);

      if (error) throw error;
      if (selectedPartner) {
        handleSelectPartner(selectedPartner);
      }
      fetchPartners();
    } catch (err: any) {
      console.error('Error updating commission status:', err);
      alert(err.message || 'Failed to update commission status.');
    }
  };

  const copyToClipboard = (text: string, code: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  // Dashboard Aggregates
  const totalPartnersCount = partners.length;
  const activePartnersCount = partners.filter(p => p.status === 'active' || !p.status).length;
  const pendingPartnersCount = partners.filter(p => p.status === 'pending').length;
  const totalReferralsCount = partners.reduce((sum, p) => sum + (p.referred_count || 0), 0);
  const totalConversionsCount = partners.reduce((sum, p) => sum + (p.premium_count || 0), 0);
  const totalCommissionEarned = partners.reduce((sum, p) => sum + (p.commission_earned || 0), 0);
  const totalCommissionPaid = partners.reduce((sum, p) => sum + (p.commission_paid || 0), 0);
  const totalCommissionPending = partners.reduce((sum, p) => sum + (p.commission_available || 0), 0);

  // Filtering & Sorting
  const filteredPartners = partners.filter(p => {
    const matchesSearch = p.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.referral_code.toLowerCase().includes(searchQuery.toLowerCase());
    if (statusFilter === 'all') return matchesSearch;
    return matchesSearch && (p.status || 'active') === statusFilter;
  }).sort((a, b) => {
    if (sortBy === 'referrals') return (b.referred_count || 0) - (a.referred_count || 0);
    if (sortBy === 'conversions') return (b.premium_count || 0) - (a.premium_count || 0);
    if (sortBy === 'earnings') return (b.commission_earned || 0) - (a.commission_earned || 0);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Pagination
  const totalPages = Math.ceil(filteredPartners.length / pageSize) || 1;
  const paginatedPartners = filteredPartners.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 text-white">
      {/* Header */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white flex items-center gap-3">
            <Users className="text-indigo-400" size={32} /> Partnership & Referral Management
          </h1>
          <p className="text-slate-400 text-sm mt-1">Real-time tracking of institutional partners, unique referral codes, conversions, and commissions.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchPartners}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
            title="Refresh Data"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2 shadow-lg shadow-indigo-600/30"
          >
            <Plus size={16} /> Add Partner
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Total Partners</span>
            <Users size={18} className="text-indigo-400" />
          </div>
          <div className="text-3xl font-display font-bold text-white">{totalPartnersCount}</div>
          <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
            <span className="text-emerald-400 font-semibold">{activePartnersCount} Active</span>
            <span>•</span>
            <span className="text-amber-400 font-semibold">{pendingPartnersCount} Pending</span>
          </div>
        </div>

        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Referrals & Conversions</span>
            <TrendingUp size={18} className="text-emerald-400" />
          </div>
          <div className="text-3xl font-display font-bold text-white">{totalReferralsCount}</div>
          <div className="mt-2 text-xs text-slate-400 flex items-center gap-1.5">
            <span className="text-emerald-400 font-bold">{totalConversionsCount} Premium Users</span>
            <span>({totalReferralsCount > 0 ? ((totalConversionsCount / totalReferralsCount) * 100).toFixed(1) : 0}%)</span>
          </div>
        </div>

        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Commission Generated</span>
            <DollarSign size={18} className="text-amber-400" />
          </div>
          <div className="text-3xl font-display font-bold text-amber-400">₦{totalCommissionEarned.toLocaleString()}</div>
          <div className="mt-2 text-xs text-slate-400">
            Across all active partner referral codes
          </div>
        </div>

        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Commission Balance</span>
            <Award size={18} className="text-purple-400" />
          </div>
          <div className="text-3xl font-display font-bold text-indigo-400">₦{totalCommissionPending.toLocaleString()}</div>
          <div className="mt-2 text-xs text-slate-400 flex items-center gap-2">
            <span>Paid: ₦{totalCommissionPaid.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Search, Filter & Sort Controls */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search partners by name, email or code..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-indigo-500 pl-9"
          />
          <Search size={16} className="absolute left-3 top-3 text-slate-500" />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
            <Filter size={14} className="text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
            <BarChart3 size={14} className="text-slate-400" />
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-transparent text-xs text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="newest">Sort: Newest</option>
              <option value="referrals">Sort: Most Referrals</option>
              <option value="conversions">Sort: Most Conversions</option>
              <option value="earnings">Sort: Highest Earnings</option>
            </select>
          </div>

          <span className="text-xs text-slate-400 font-medium ml-auto">
            Showing {filteredPartners.length} partners
          </span>
        </div>
      </div>

      {/* Partners Table */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-display font-bold text-white text-lg">Partners Directory</h3>
          <span className="text-xs text-slate-400 font-medium">Page {currentPage} of {totalPages}</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
          </div>
        ) : fetchError ? (
          // A failed load is reported as a failure. Previously it fell through
          // to the empty state below, so a database or permission error looked
          // exactly like "this platform has no partners".
          <div className="text-center py-16 px-4">
            <AlertCircle size={40} className="mx-auto text-rose-400/70 mb-3" />
            <p className="text-rose-300 font-medium">Could not load partners</p>
            <p className="text-xs text-slate-400 mt-1 break-words max-w-lg mx-auto">{fetchError}</p>
            <button
              onClick={fetchPartners}
              className="mt-5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-2"
            >
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        ) : paginatedPartners.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-900/50">
                  <th className="py-4 px-6">Partner</th>
                  <th className="py-4 px-6">Referral Code / Link</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6">Referrals</th>
                  <th className="py-4 px-6">Premium Users</th>
                  <th className="py-4 px-6">Commission</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {paginatedPartners.map((partner) => {
                  const refUrl = `${window.location.origin}/signup?ref=${partner.referral_code}`;
                  const isCopied = copiedCode === partner.referral_code;
                  return (
                    <tr 
                      key={partner.id} 
                      className="hover:bg-slate-900/60 transition-colors group"
                    >
                      <td className="py-4 px-6 cursor-pointer" onClick={() => handleSelectPartner(partner)}>
                        <div className="font-bold text-white group-hover:text-indigo-400 transition-colors">{partner.full_name}</div>
                        <div className="text-xs text-slate-400">{partner.email} {partner.phone && `• ${partner.phone}`}</div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-300 font-mono text-xs font-bold">
                            {partner.referral_code}
                          </span>
                          <button
                            onClick={() => copyToClipboard(refUrl, partner.referral_code)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"
                            title="Copy Referral Link"
                          >
                            {isCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                          </button>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                          (partner.status || 'active') === 'active' 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : (partner.status || 'active') === 'pending'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {partner.status || 'active'}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <span className="font-bold text-white bg-slate-800 px-2.5 py-1 rounded-lg text-xs">
                          {partner.referred_count || 0}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg text-xs border border-emerald-500/20">
                            {partner.premium_count || 0}
                          </span>
                          <span className="text-[11px] text-slate-500">({partner.conversion_rate || 0}%)</span>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="text-white font-bold text-xs">₦{(partner.commission_earned || 0).toLocaleString()}</div>
                        <div className="text-[11px] text-slate-400">Avail: <span className="text-amber-400 font-semibold">₦{(partner.commission_available || 0).toLocaleString()}</span></div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleSelectPartner(partner)}
                            className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                          >
                            View Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16 px-4">
            <Users size={40} className="mx-auto text-slate-600 mb-3" />
            <p className="text-slate-300 font-medium">No partners found.</p>
            <p className="text-xs text-slate-500 mt-1">Try adjusting your search query or register a new partner.</p>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-800 flex items-center justify-between">
            <button
              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold rounded-xl"
            >
              Previous
            </button>
            <span className="text-xs text-slate-400 font-medium">Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold rounded-xl"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Add Partner Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#0f172a] border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative"
          >
            <button onClick={() => setShowAddModal(false)} className="absolute top-6 right-6 text-slate-400 hover:text-white">
              <X size={20} />
            </button>

            <h2 className="text-xl font-display font-bold text-white mb-2">Register New Partner</h2>
            <p className="text-xs text-slate-400 mb-6">Create a unique referral code and tracking profile for an institutional partner.</p>

            {errorMsg && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-medium">
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs font-medium">
                {successMsg}
              </div>
            )}

            <form onSubmit={handleCreatePartner} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Partner Full Name</label>
                <input 
                  type="text" 
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Dr. Aliyu Ibrahim"
                  required
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Email Address</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. aliyu@example.com"
                  required
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Phone Number (Optional)</label>
                <input 
                  type="text" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +234 803 000 1122"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">Referral Code</label>
                  <button 
                    type="button" 
                    onClick={generateRandomCode}
                    className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    <Sparkles size={12} /> Generate Code
                  </button>
                </div>
                <input 
                  type="text" 
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  placeholder="e.g. ALIYU20"
                  required
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono text-sm uppercase focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Commission Percentage (%)</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={commissionPct}
                  onChange={(e) => setCommissionPct(e.target.value)}
                  required
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Partner'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Partner Detailed Drawer / Modal */}
      {selectedPartner && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#0f172a] border border-slate-800 rounded-3xl max-w-3xl w-full p-6 shadow-2xl relative space-y-6 max-h-[90vh] overflow-y-auto"
          >
            <button onClick={() => setSelectedPartner(null)} className="absolute top-6 right-6 text-slate-400 hover:text-white">
              <X size={20} />
            </button>

            {/* Partner Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
                    Partner Management
                  </span>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${
                    (selectedPartner.status || 'active') === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}>
                    {selectedPartner.status || 'active'}
                  </span>
                </div>
                <h2 className="text-2xl font-display font-bold text-white">{selectedPartner.full_name}</h2>
                <p className="text-xs text-slate-400 mt-0.5">{selectedPartner.email} {selectedPartner.phone && `• ${selectedPartner.phone}`}</p>
              </div>

              {/* Admin Actions */}
              <div className="flex items-center gap-2">
                {(selectedPartner.status || 'active') === 'active' ? (
                  <button
                    onClick={() => setConfirmAction({
                      title: 'Suspend Partner',
                      message: `Are you sure you want to suspend ${selectedPartner.full_name}? Their referral links will be temporarily disabled.`,
                      action: () => updatePartnerStatus(selectedPartner.id, 'suspended')
                    })}
                    className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5"
                  >
                    <Ban size={14} /> Suspend
                  </button>
                ) : (
                  <button
                    onClick={() => updatePartnerStatus(selectedPartner.id, 'active')}
                    className="px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5"
                  >
                    <Play size={14} /> Activate
                  </button>
                )}
              </div>
            </div>

            {/* Navigation Tabs inside Detail View */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <button
                onClick={() => setPartnerTab('overview')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${partnerTab === 'overview' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
              >
                Overview & Financials
              </button>
              <button
                onClick={() => setPartnerTab('referrals')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${partnerTab === 'referrals' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
              >
                Referred Users ({referredUsers.length})
              </button>
              <button
                onClick={() => setPartnerTab('commissions')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${partnerTab === 'commissions' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}
              >
                Commission Ledger ({commissionLedger.length})
              </button>
            </div>

            {/* Tab 1: Overview */}
            {partnerTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <Tag size={14} className="text-indigo-400" /> Referral Code & Link
                    </div>
                    <div className="text-indigo-300 font-mono text-base font-bold mb-2">{selectedPartner.referral_code}</div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        readOnly 
                        value={`${window.location.origin}/signup?ref=${selectedPartner.referral_code}`}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 font-mono"
                      />
                      <button
                        onClick={() => copyToClipboard(`${window.location.origin}/signup?ref=${selectedPartner.referral_code}`, selectedPartner.referral_code)}
                        className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shrink-0"
                      >
                        {copiedCode === selectedPartner.referral_code ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <Award size={14} className="text-purple-400" /> Commission Settings
                    </div>
                    <div className="text-white text-lg font-bold mb-1">{selectedPartner.commission_percentage}% Rate</div>
                    <p className="text-xs text-slate-400">Earned on every successful Premium referral conversion.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* These four are deliberately ordered and labelled so that
                      "how many signed up" can never be read as "how many pay".
                      The previous "Referral Clicks" card held a fabricated
                      figure and has been replaced by a metric that is real. */}
                  <div
                    className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 text-center"
                    title="Referred users with a live commission entry — the ones that earned a reward"
                  >
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Qualifying Premium</div>
                    <div className="text-xl font-display font-bold text-purple-400">{selectedPartner.qualifying_count || 0}</div>
                  </div>
                  <div
                    className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 text-center"
                    title="Everyone who signed up with this partner's code"
                  >
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Referrals</div>
                    <div className="text-xl font-display font-bold text-white">{selectedPartner.referred_count || 0}</div>
                  </div>
                  <div
                    className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 text-center"
                    title="Referred users whose subscription is currently active"
                  >
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Premium Users</div>
                    <div className="text-xl font-display font-bold text-emerald-400">{selectedPartner.premium_count || 0}</div>
                  </div>
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 text-center">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Premium Conversion</div>
                    <div className="text-xl font-display font-bold text-indigo-400">{selectedPartner.conversion_rate || 0}%</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Commission Earned</div>
                    <div className="text-xl font-bold text-amber-400">₦{(selectedPartner.commission_earned || 0).toLocaleString()}</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Commission Paid</div>
                    <div className="text-xl font-bold text-slate-300">₦{(selectedPartner.commission_paid || 0).toLocaleString()}</div>
                  </div>
                  <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-2xl p-4">
                    <div className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider mb-1">Available Balance</div>
                    <div className="text-xl font-bold text-indigo-400">₦{(selectedPartner.commission_available || 0).toLocaleString()}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Referred Users */}
            {partnerTab === 'referrals' && (
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Referred Users List</h4>
                {loadingDetails ? (
                  <div className="py-8 text-center text-xs text-slate-500">Loading referred users...</div>
                ) : referredUsers.length > 0 ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {referredUsers.map((u: any) => {
                      const isPremium = !!u.premium_status && PREMIUM_STATUSES.includes(u.premium_status);
                      return (
                        <div key={u.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                          <div>
                            <div className="font-bold text-white text-sm flex items-center gap-2">
                              {u.full_name || 'Unnamed Student'}
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isPremium ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'}`}>
                                {isPremium ? 'Premium (Converted)' : 'Free User'}
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">{u.email} {u.payment_reference && `• Ref: ${u.payment_reference}`}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-slate-400">{new Date(u.created_at).toLocaleDateString()}</div>
                            <span className="text-[10px] font-bold text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded">
                              {u.role || 'Student'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-12 text-center text-xs text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800">
                    No users have signed up using this partner's referral code yet.
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Commissions */}
            {partnerTab === 'commissions' && (
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Commission Ledger</h4>
                {loadingDetails ? (
                  <div className="py-8 text-center text-xs text-slate-500">Loading commissions...</div>
                ) : commissionLedger.length > 0 ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {commissionLedger.map((item: any) => (
                      <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-emerald-400 text-sm flex items-center gap-2">
                            +₦{Number(item.commission_amount).toLocaleString()} ({item.commission_rate * 100}% commission)
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                              item.status === 'paid' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                            }`}>
                              {item.status}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 font-mono mt-0.5">Payment Ref: {item.payment_reference} (Amt: ₦{Number(item.payment_amount).toLocaleString()})</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right text-xs text-slate-400">
                            {new Date(item.created_at).toLocaleDateString()}
                          </div>
                          {item.status === 'approved' && (
                            <button
                              onClick={() => updateCommissionStatus(item.id, 'paid')}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold"
                            >
                              Mark Paid
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center text-xs text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800">
                    No commission ledger entries found for this partner.
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-slate-800">
              <button
                onClick={() => setSelectedPartner(null)}
                className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#0f172a] border border-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl text-center space-y-4"
          >
            <div className="w-12 h-12 bg-rose-500/10 text-rose-400 rounded-2xl border border-rose-500/20 flex items-center justify-center mx-auto">
              <AlertCircle size={24} />
            </div>
            <h3 className="text-lg font-bold text-white">{confirmAction.title}</h3>
            <p className="text-xs text-slate-400">{confirmAction.message}</p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction.action}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-600/30"
              >
                Confirm
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
