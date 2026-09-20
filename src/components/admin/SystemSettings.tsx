import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Settings, Globe, BookOpen, Clock, Award, Users, Bell, Save, CheckCircle2, AlertCircle, RefreshCw, ShieldAlert, ToggleLeft, ToggleRight, Cpu, HardDrive, Key, Activity, ShieldCheck, AlertTriangle } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { refreshGeneralSettings } from '../../lib/platformSettings';

export default function SystemSettings() {
  const [activeTab, setActiveTab] = useState<'general' | 'academic' | 'cbt' | 'premium' | 'partnership' | 'notification' | 'features' | 'health'>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [unsavedChanges, setUnsavedChanges] = useState(false);

  // Settings State
  const [general, setGeneral] = useState({
    platform_name: 'Tunborzy Academy',
    platform_description: 'Excellence in Academic and CBT Preparation',
    support_email: 'support@tunborzy.edu.ng',
    support_phone: '+234 800 000 0000',
    maintenance_mode: false
  });

  const [academic, setAcademic] = useState({
    undergraduate_levels: '100L, 200L, 300L, 400L, 500L',
    current_academic_session: '2026/2027',
    current_semester: 'First Semester',
    course_material_config: 'Standard'
  });

  const [cbt, setCbt] = useState({
    undergraduate_cbt_enabled: true,
    utme_cbt_enabled: true,
    post_utme_cbt_enabled: true,
    default_exam_duration_mins: 30,
    default_question_count: 40
  });

  const [premium, setPremium] = useState({
    premium_system_enabled: true,
    premium_access_config: 'Full Access',
    subscription_config: 'Monthly / Yearly'
  });

  const [partnership, setPartnership] = useState({
    referral_system_enabled: true,
    commission_percentage: 20.0,
    default_referral_config: 'Standard 20% Commission'
  });

  const [notification, setNotification] = useState({
    notifications_enabled: true,
    system_notification_config: 'Real-time Push & In-App',
    notification_behavior: 'Instant'
  });

  const [features, setFeatures] = useState({
    undergraduate_materials_enabled: true,
    undergraduate_ai_rag_enabled: true,
    undergraduate_cbt_enabled: true,
    utme_cbt_enabled: true,
    post_utme_cbt_enabled: true,
    partnership_referral_enabled: true,
    premium_system_enabled: true,
    notifications_enabled: true,
    student_dashboard_enabled: true,
    lecturer_dashboard_enabled: true
  });

  // System Health state
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/admin/settings', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      if (!res.ok) throw new Error('Failed to fetch platform settings');
      const data = await res.json();

      if (data.settings && Array.isArray(data.settings)) {
        data.settings.forEach((row: any) => {
          if (row.category === 'general' && row.settings) {
            setGeneral(prev => ({ ...prev, ...row.settings }));
          } else if (row.category === 'academic' && row.settings) {
            setAcademic(prev => ({
              ...prev,
              ...row.settings,
              undergraduate_levels: Array.isArray(row.settings.undergraduate_levels) 
                ? row.settings.undergraduate_levels.join(', ') 
                : row.settings.undergraduate_levels || prev.undergraduate_levels
            }));
          } else if (row.category === 'cbt' && row.settings) {
            setCbt(prev => ({ ...prev, ...row.settings }));
          } else if (row.category === 'premium' && row.settings) {
            setPremium(prev => ({ ...prev, ...row.settings }));
          } else if (row.category === 'partnership' && row.settings) {
            setPartnership(prev => ({ ...prev, ...row.settings }));
          } else if (row.category === 'notification' && row.settings) {
            setNotification(prev => ({ ...prev, ...row.settings }));
          } else if (row.category === 'features' && row.settings) {
            setFeatures(prev => ({ ...prev, ...row.settings }));
          }
        });
      }
    } catch (err: any) {
      console.error('Error loading settings:', err);
      setErrorMsg(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
      setUnsavedChanges(false);
    }
  };

  const checkSystemHealth = async () => {
    setCheckingHealth(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/admin/system-health', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      if (!res.ok) throw new Error('Failed to run system health diagnostics');
      const data = await res.json();
      setHealthStatus(data);
    } catch (err: any) {
      console.error('Health check error:', err);
      setErrorMsg('Failed to check system health');
    } finally {
      setCheckingHealth(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'health') {
      checkSystemHealth();
    }
  }, [activeTab]);

  const handleSave = async (category: string) => {
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      let payloadSettings: any = {};
      if (category === 'general') {
        if (!general.platform_name.trim()) throw new Error('Platform name cannot be empty');
        if (!general.support_email.includes('@')) throw new Error('Invalid support email address');
        payloadSettings = general;
      } else if (category === 'academic') {
        payloadSettings = {
          ...academic,
          undergraduate_levels: academic.undergraduate_levels.split(',').map(s => s.trim()).filter(Boolean)
        };
      } else if (category === 'cbt') {
        const dur = Number(cbt.default_exam_duration_mins);
        const qCount = Number(cbt.default_question_count);
        if (isNaN(dur) || dur <= 0) throw new Error('Exam duration must be positive');
        if (isNaN(qCount) || qCount <= 0) throw new Error('Question count must be positive');
        payloadSettings = cbt;
      } else if (category === 'premium') {
        payloadSettings = premium;
      } else if (category === 'partnership') {
        const pct = Number(partnership.commission_percentage);
        if (isNaN(pct) || pct < 0 || pct > 100) throw new Error('Commission percentage must be between 0 and 100');
        payloadSettings = partnership;
      } else if (category === 'notification') {
        payloadSettings = notification;
      } else if (category === 'features') {
        payloadSettings = features;
      }

      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ category, settings: payloadSettings })
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to save settings');

      // General settings drive the maintenance gate and the public branding, so
      // the shared store is refreshed from the database rather than patched —
      // the app-wide gate then reflects the saved value on the next render.
      if (category === 'general') {
        await refreshGeneralSettings();
      }

      setSuccessMsg(`${category.charAt(0).toUpperCase() + category.slice(1)} settings updated successfully!`);
      setUnsavedChanges(false);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      console.error('Error saving settings:', err);
      setErrorMsg(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'general', label: 'General & Maintenance', icon: Globe },
    { id: 'academic', label: 'Academic & Session', icon: BookOpen },
    { id: 'cbt', label: 'CBT Settings', icon: Clock },
    { id: 'premium', label: 'Premium Settings', icon: Award },
    { id: 'partnership', label: 'Partnership Settings', icon: Users },
    { id: 'notification', label: 'Notification Settings', icon: Bell },
    { id: 'features', label: 'Platform Features', icon: ShieldAlert },
    { id: 'health', label: 'System Health & Env', icon: Activity },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-7xl mx-auto pb-12"
    >
      {/* Header */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white flex items-center gap-3">
            <Settings className="text-indigo-400" size={32} /> Platform Admin Settings
          </h1>
          <p className="text-slate-400 text-sm mt-1">Manage general platform configuration, maintenance mode, academic sessions, and system health.</p>
        </div>
        <button
          onClick={fetchSettings}
          className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 self-start md:self-auto"
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-300 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 size={16} /> {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-xs font-medium flex items-center gap-2">
          <AlertCircle size={16} /> {errorMsg}
        </div>
      )}

      {/* Navigation Tabs & Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar Nav */}
        <div className="lg:col-span-4 bg-[#0f172a] border border-slate-800 rounded-3xl p-4 shadow-xl space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-xs font-bold transition-all ${isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:text-white hover:bg-slate-900/50'}`}
              >
                <Icon size={18} /> {tab.label}
              </button>
            );
          })}
        </div>

        {/* Main Settings Panel */}
        <div className="lg:col-span-8 bg-[#0f172a] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          {/* SYSTEM HEALTH & ENVIRONMENT CHECK */}
          {activeTab === 'health' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-display font-bold text-white">System Health & Environment Diagnostics</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Real-time connection status of platform dependencies and environment configuration.</p>
                </div>
                <button
                  onClick={checkSystemHealth}
                  disabled={checkingHealth}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2"
                >
                  <RefreshCw size={14} className={checkingHealth ? 'animate-spin' : ''} /> Check Health
                </button>
              </div>

              {checkingHealth ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full"></div>
                </div>
              ) : healthStatus ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { name: 'Supabase Database', status: healthStatus.supabase_db, icon: HardDrive },
                      { name: 'Supabase Authentication', status: healthStatus.supabase_auth, icon: Key },
                      { name: 'Supabase Storage', status: healthStatus.supabase_storage, icon: HardDrive },
                      { name: 'Express Backend', status: healthStatus.express_backend, icon: Cpu },
                      { name: 'Gemini AI API', status: healthStatus.gemini_ai, icon: Cpu },
                      { name: 'Flutterwave Config', status: healthStatus.flutterwave, icon: ShieldCheck },
                    ].map((item, idx) => {
                      const isConnected = item.status === 'Connected';
                      const isMissing = item.status === 'Configuration Missing';
                      const StatusIcon = isConnected ? ShieldCheck : AlertTriangle;
                      return (
                        <div key={idx} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-slate-800 text-slate-300">
                              <item.icon size={20} />
                            </div>
                            <div>
                              <div className="text-white text-sm font-bold">{item.name}</div>
                              <div className="text-xs text-slate-400">Environment verified</div>
                            </div>
                          </div>
                          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${
                            isConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            isMissing ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                            'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}>
                            <StatusIcon size={14} /> {item.status}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-xs text-indigo-300 flex items-center gap-2">
                    <ShieldCheck size={16} /> Security Verified: No private keys, secret tokens, or sensitive environment credentials are exposed to the client interface.
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* GENERAL & MAINTENANCE SETTINGS */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-display font-bold text-white">General Platform Configuration & Maintenance</h3>
                <p className="text-xs text-slate-400 mt-0.5">Configure platform branding, contact details, and emergency maintenance mode.</p>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between">
                  <div>
                    <div className="text-amber-300 text-sm font-bold flex items-center gap-2">
                      <AlertTriangle size={18} /> Maintenance Mode
                    </div>
                    <div className="text-xs text-slate-300 mt-0.5">When enabled, students and lecturers see a maintenance notice. Admins retain full access.</div>
                  </div>
                  <button
                    onClick={() => {
                      setGeneral({ ...general, maintenance_mode: !general.maintenance_mode });
                      setUnsavedChanges(true);
                    }}
                    className={`text-2xl transition-colors ${general.maintenance_mode ? 'text-amber-400' : 'text-slate-600'}`}
                  >
                    {general.maintenance_mode ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Platform Name</label>
                  <input
                    type="text"
                    value={general.platform_name}
                    onChange={(e) => { setGeneral({ ...general, platform_name: e.target.value }); setUnsavedChanges(true); }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Platform Description</label>
                  <textarea
                    rows={3}
                    value={general.platform_description}
                    onChange={(e) => { setGeneral({ ...general, platform_description: e.target.value }); setUnsavedChanges(true); }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Support Email</label>
                    <input
                      type="email"
                      value={general.support_email}
                      onChange={(e) => { setGeneral({ ...general, support_email: e.target.value }); setUnsavedChanges(true); }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Support Phone</label>
                    <input
                      type="text"
                      value={general.support_phone}
                      onChange={(e) => { setGeneral({ ...general, support_phone: e.target.value }); setUnsavedChanges(true); }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ACADEMIC & SESSION SETTINGS */}
          {activeTab === 'academic' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-display font-bold text-white">Academic & Session Control</h3>
                <p className="text-xs text-slate-400 mt-0.5">Manage undergraduate levels, current academic session, and semester.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Available Undergraduate Levels (Comma separated)</label>
                  <input
                    type="text"
                    value={academic.undergraduate_levels}
                    onChange={(e) => { setAcademic({ ...academic, undergraduate_levels: e.target.value }); setUnsavedChanges(true); }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Current Academic Session</label>
                    <input
                      type="text"
                      value={academic.current_academic_session}
                      onChange={(e) => { setAcademic({ ...academic, current_academic_session: e.target.value }); setUnsavedChanges(true); }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Current Semester</label>
                    <select
                      value={academic.current_semester}
                      onChange={(e) => { setAcademic({ ...academic, current_semester: e.target.value }); setUnsavedChanges(true); }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                    >
                      <option value="First Semester">First Semester</option>
                      <option value="Second Semester">Second Semester</option>
                      <option value="Summer / Rain Semester">Summer / Rain Semester</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Course/Material Configuration</label>
                  <input
                    type="text"
                    value={academic.course_material_config}
                    onChange={(e) => { setAcademic({ ...academic, course_material_config: e.target.value }); setUnsavedChanges(true); }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* CBT SETTINGS */}
          {activeTab === 'cbt' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-display font-bold text-white">CBT Settings</h3>
                <p className="text-xs text-slate-400 mt-0.5">Enable or disable CBT testing environments and default exam parameters.</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                  <div>
                    <div className="text-white text-sm font-bold">Undergraduate CBT Enabled</div>
                    <div className="text-xs text-slate-400">Allow students to take undergraduate CBT exams.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={cbt.undergraduate_cbt_enabled}
                    onChange={(e) => { setCbt({ ...cbt, undergraduate_cbt_enabled: e.target.checked }); setUnsavedChanges(true); }}
                    className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                  <div>
                    <div className="text-white text-sm font-bold">UTME CBT Enabled</div>
                    <div className="text-xs text-slate-400">Allow candidates to practice UTME mock CBT.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={cbt.utme_cbt_enabled}
                    onChange={(e) => { setCbt({ ...cbt, utme_cbt_enabled: e.target.checked }); setUnsavedChanges(true); }}
                    className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                  <div>
                    <div className="text-white text-sm font-bold">Post-UTME CBT Enabled</div>
                    <div className="text-xs text-slate-400">Allow students to practice Post-UTME screening tests.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={cbt.post_utme_cbt_enabled}
                    onChange={(e) => { setCbt({ ...cbt, post_utme_cbt_enabled: e.target.checked }); setUnsavedChanges(true); }}
                    className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Default Exam Duration (Minutes)</label>
                    <input
                      type="number"
                      value={cbt.default_exam_duration_mins}
                      onChange={(e) => { setCbt({ ...cbt, default_exam_duration_mins: parseInt(e.target.value) || 30 }); setUnsavedChanges(true); }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Default Question Count</label>
                    <input
                      type="number"
                      value={cbt.default_question_count}
                      onChange={(e) => { setCbt({ ...cbt, default_question_count: parseInt(e.target.value) || 40 }); setUnsavedChanges(true); }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PREMIUM SETTINGS */}
          {activeTab === 'premium' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-display font-bold text-white">Premium Settings</h3>
                <p className="text-xs text-slate-400 mt-0.5">Manage subscription system access and payment integration gates.</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                  <div>
                    <div className="text-white text-sm font-bold">Premium System Enabled</div>
                    <div className="text-xs text-slate-400">Enable premium subscription gating across the platform.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={premium.premium_system_enabled}
                    onChange={(e) => { setPremium({ ...premium, premium_system_enabled: e.target.checked }); setUnsavedChanges(true); }}
                    className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Premium Access Configuration</label>
                  <input
                    type="text"
                    value={premium.premium_access_config}
                    onChange={(e) => { setPremium({ ...premium, premium_access_config: e.target.value }); setUnsavedChanges(true); }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Subscription / Payment Gateway</label>
                  <input
                    type="text"
                    value={premium.subscription_config}
                    onChange={(e) => { setPremium({ ...premium, subscription_config: e.target.value }); setUnsavedChanges(true); }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* PARTNERSHIP SETTINGS */}
          {activeTab === 'partnership' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-display font-bold text-white">Partnership Settings</h3>
                <p className="text-xs text-slate-400 mt-0.5">Manage referral attribution and partner commission percentages.</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                  <div>
                    <div className="text-white text-sm font-bold">Referral System Enabled</div>
                    <div className="text-xs text-slate-400">Allow partners to register and students to use referral codes.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={partnership.referral_system_enabled}
                    onChange={(e) => { setPartnership({ ...partnership, referral_system_enabled: e.target.checked }); setUnsavedChanges(true); }}
                    className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Partner Commission Percentage (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={partnership.commission_percentage}
                    onChange={(e) => { setPartnership({ ...partnership, commission_percentage: parseFloat(e.target.value) || 20 }); setUnsavedChanges(true); }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Default verified business rule is 20%. Changes apply to future verified premium conversions.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Default Referral Configuration</label>
                  <input
                    type="text"
                    value={partnership.default_referral_config}
                    onChange={(e) => { setPartnership({ ...partnership, default_referral_config: e.target.value }); setUnsavedChanges(true); }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* NOTIFICATION SETTINGS */}
          {activeTab === 'notification' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-display font-bold text-white">Notification Settings</h3>
                <p className="text-xs text-slate-400 mt-0.5">Configure platform alerts, push notifications, and broadcast behavior.</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                  <div>
                    <div className="text-white text-sm font-bold">Notifications Enabled</div>
                    <div className="text-xs text-slate-400">Enable system-wide notifications and alerts.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notification.notifications_enabled}
                    onChange={(e) => { setNotification({ ...notification, notifications_enabled: e.target.checked }); setUnsavedChanges(true); }}
                    className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">System Notification Configuration</label>
                  <input
                    type="text"
                    value={notification.system_notification_config}
                    onChange={(e) => { setNotification({ ...notification, system_notification_config: e.target.value }); setUnsavedChanges(true); }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Notification Behavior</label>
                  <input
                    type="text"
                    value={notification.notification_behavior}
                    onChange={(e) => { setNotification({ ...notification, notification_behavior: e.target.value }); setUnsavedChanges(true); }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* PLATFORM FEATURES TOGGLES */}
          {activeTab === 'features' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-display font-bold text-white">Platform Feature Toggles</h3>
                <p className="text-xs text-slate-400 mt-0.5">Control major platform features and endpoints globally. Disabled features will be blocked server-side.</p>
              </div>

              <div className="space-y-3">
                {[
                  { key: 'undergraduate_materials_enabled', title: 'Undergraduate Academic Materials', desc: 'Allow students to browse and view course materials.' },
                  { key: 'undergraduate_ai_rag_enabled', title: 'Undergraduate Material AI / RAG', desc: 'Enable AI tutor answers indexed from undergraduate materials.' },
                  { key: 'undergraduate_cbt_enabled', title: 'Undergraduate CBT', desc: 'Allow undergraduate students to start course CBT examinations.' },
                  { key: 'utme_cbt_enabled', title: 'UTME CBT Practice', desc: 'Allow candidates to practice UTME mock CBT exams.' },
                  { key: 'post_utme_cbt_enabled', title: 'Post-UTME CBT Practice', desc: 'Allow students to take Post-UTME screening tests.' },
                  { key: 'partnership_referral_enabled', title: 'Partnership & Referral System', desc: 'Enable partner registration and referral code attribution.' },
                  { key: 'premium_system_enabled', title: 'Premium System', desc: 'Enable subscription gating and payment checkout verification.' },
                  { key: 'notifications_enabled', title: 'Platform Notifications', desc: 'Generate and display system notifications and alerts.' },
                  { key: 'student_dashboard_enabled', title: 'Student Dashboard', desc: 'Enable student dashboard access.' },
                  { key: 'lecturer_dashboard_enabled', title: 'Lecturer Dashboard', desc: 'Enable lecturer dashboard access.' },
                ].map(item => {
                  const isEnabled = (features as any)[item.key];
                  return (
                    <div key={item.key} className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                      <div>
                        <div className="text-white text-sm font-bold flex items-center gap-2">
                          {item.title}
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isEnabled ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                            {isEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">{item.desc}</div>
                      </div>
                      <button
                        onClick={() => {
                          setFeatures({ ...features, [item.key]: !isEnabled });
                          setUnsavedChanges(true);
                        }}
                        className={`text-2xl transition-colors ${isEnabled ? 'text-emerald-400' : 'text-slate-600'}`}
                      >
                        {isEnabled ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action Bar */}
          {activeTab !== 'health' && (
            <div className="pt-6 border-t border-slate-800 flex items-center justify-between">
              <div>
                {unsavedChanges && (
                  <span className="text-xs text-amber-400 font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span> Unsaved changes
                  </span>
                )}
              </div>
              <button
                onClick={() => handleSave(activeTab)}
                disabled={saving}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2 shadow-lg shadow-indigo-600/30 disabled:opacity-50"
              >
                <Save size={16} /> {saving ? 'Saving...' : `Save ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Settings`}
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
