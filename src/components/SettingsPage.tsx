import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings as SettingsIcon, User, Shield, Check, Info, 
  LogOut, Eye, EyeOff, Hash, Calendar, GraduationCap, 
  FileText, X, Save
} from 'lucide-react';
import DashboardLayout from './dashboard/DashboardLayout';
import { useProfile, refreshProfile } from '../lib/useProfile';
import { supabase } from '../supabaseClient';

interface SettingsPageProps {
  onLogout: () => void;
  onNavigate?: (view: string) => void;
}

export default function SettingsPage({ onLogout, onNavigate }: SettingsPageProps) {
  const { profile, loading } = useProfile();

  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [bioInput, setBioInput] = useState('');
  const [universityInput, setUniversityInput] = useState('');
  const [courseInput, setCourseInput] = useState('');
  const [levelInput, setLevelInput] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Modals
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [activeModal, setActiveModal] = useState<'privacy' | 'terms' | null>(null);

  useEffect(() => {
    if (profile) {
      setNameInput(profile.full_name || '');
      setEmailInput(profile.email || '');
      setPhoneInput(profile.phone_number || '');
      setBioInput(profile.bio || '');
      setUniversityInput(profile.university || '');
      setCourseInput(profile.course || '');
      setLevelInput(profile.level || '');
    }
  }, [profile]);

  if (loading) {
    return (
      <DashboardLayout onLogout={onLogout} currentView="settings" onNavigate={onNavigate}>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="flex flex-col items-center gap-4">
            <svg className="animate-spin h-8 w-8 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-slate-400 font-medium">Loading settings...</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const handleSave = async () => {
    if (!nameInput.trim()) {
      setErrorMsg("Full Name is required");
      return;
    }
    setErrorMsg('');
    if (!profile) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: nameInput,
        university: universityInput || null,
        course: courseInput || null,
        level: levelInput || null,
        phone_number: phoneInput || null,
        bio: bioInput || null
      }).eq('id', profile.id);

      if (error) throw error;

      await supabase.auth.updateUser({
        data: {
          full_name: nameInput,
          phone_number: phoneInput,
          bio: bioInput,
          university: universityInput,
          course: courseInput,
          level: levelInput
        }
      });

      await refreshProfile();
      setShowSaveSuccess(true);
      setHasChanges(false);
      setTimeout(() => setShowSaveSuccess(false), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while saving profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("All password fields are required");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters");
      return;
    }
    setPasswordError('');
    setIsUpdatingPassword(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile?.email || emailInput,
        password: currentPassword,
      });
      if (signInError) throw new Error("Incorrect current password.");

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setPasswordSuccess("Password updated successfully");
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(''), 3000);
    } catch (err: any) {
      setPasswordError(err.message || "Failed to update password");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <DashboardLayout onLogout={onLogout} currentView="settings" onNavigate={onNavigate}>
      <div className="w-full pb-24 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8 w-full max-w-4xl mx-auto"
        >
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-white mb-2 flex items-center gap-3">
              <SettingsIcon className="text-indigo-500" size={28} /> Account Settings
            </h1>
            <p className="text-sm font-body text-slate-400">Manage your profile details and account security.</p>
          </div>

          <div className="space-y-6">
            
            {/* Profile / Account Information */}
            <div className="bg-[#0f172a]/80 backdrop-blur-md border border-slate-800 rounded-3xl p-6 shadow-xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
                  <User size={20} className="text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-xl font-display font-bold text-white">Account Information</h3>
                  <p className="text-xs text-slate-400">Your personal and academic profile details</p>
                </div>
              </div>
              
              <div className="space-y-4">
                {errorMsg && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
                    {errorMsg}
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 ml-1">Full Name</label>
                    <input 
                      type="text" 
                      value={nameInput} 
                      onChange={(e) => { setNameInput(e.target.value); setHasChanges(true); }} 
                      className="w-full bg-[#020617] border border-slate-700 focus:border-indigo-500 text-slate-200 rounded-xl px-4 py-3 outline-none transition-colors text-sm" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 ml-1">Email Address (Read-only)</label>
                    <input 
                      type="email" 
                      value={emailInput} 
                      disabled
                      className="w-full bg-[#020617]/50 border border-slate-800 text-slate-400 rounded-xl px-4 py-3 outline-none cursor-not-allowed text-sm" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 ml-1">Phone Number</label>
                    <input 
                      type="tel" 
                      value={phoneInput} 
                      onChange={(e) => { setPhoneInput(e.target.value); setHasChanges(true); }} 
                      placeholder="+234 800 000 0000" 
                      className="w-full bg-[#020617] border border-slate-700 focus:border-indigo-500 text-slate-200 rounded-xl px-4 py-3 outline-none transition-colors text-sm" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 ml-1">University</label>
                    <input 
                      type="text" 
                      value={universityInput} 
                      onChange={(e) => { setUniversityInput(e.target.value); setHasChanges(true); }} 
                      placeholder="University Name" 
                      className="w-full bg-[#020617] border border-slate-700 focus:border-indigo-500 text-slate-200 rounded-xl px-4 py-3 outline-none transition-colors text-sm" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 ml-1">Course / Department</label>
                    <input 
                      type="text" 
                      value={courseInput} 
                      onChange={(e) => { setCourseInput(e.target.value); setHasChanges(true); }} 
                      placeholder="e.g. Computer Science" 
                      className="w-full bg-[#020617] border border-slate-700 focus:border-indigo-500 text-slate-200 rounded-xl px-4 py-3 outline-none transition-colors text-sm" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 ml-1">Level</label>
                    <input 
                      type="text" 
                      value={levelInput} 
                      onChange={(e) => { setLevelInput(e.target.value); setHasChanges(true); }} 
                      placeholder="e.g. 100L" 
                      className="w-full bg-[#020617] border border-slate-700 focus:border-indigo-500 text-slate-200 rounded-xl px-4 py-3 outline-none transition-colors text-sm" 
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 ml-1">Bio</label>
                  <textarea 
                    value={bioInput} 
                    onChange={(e) => { setBioInput(e.target.value); setHasChanges(true); }} 
                    placeholder="Write a short academic bio..." 
                    className="w-full bg-[#020617] border border-slate-700 focus:border-indigo-500 text-slate-200 rounded-xl px-4 py-3 outline-none transition-colors resize-none text-sm" 
                    rows={2}
                  ></textarea>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-800/60 mt-4">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-[#020617]/50 border border-slate-800/50">
                    <Hash size={16} className="text-indigo-400" />
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Student ID</p>
                      <p className="text-xs text-slate-300 font-mono">{profile?.student_id || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-[#020617]/50 border border-slate-800/50">
                    <Calendar size={16} className="text-indigo-400" />
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Joined</p>
                      <p className="text-xs text-slate-300">
                        {profile?.registration_date ? new Date(profile.registration_date).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-[#020617]/50 border border-slate-800/50">
                    <GraduationCap size={16} className="text-indigo-400" />
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Role</p>
                      <p className="text-xs text-slate-300">{profile?.role || 'Student'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Change Password */}
            <div className="bg-[#0f172a]/80 backdrop-blur-md border border-slate-800 rounded-3xl p-6 shadow-xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0">
                  <Shield size={20} className="text-rose-400" />
                </div>
                <div>
                  <h3 className="text-xl font-display font-bold text-white">Change Password</h3>
                  <p className="text-xs text-slate-400">Secure your account with a strong password</p>
                </div>
              </div>
              
              <div className="space-y-4 max-w-2xl">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 ml-1">Current Password</label>
                  <div className="relative">
                    <input 
                      type={showCurrentPassword ? "text" : "password"} 
                      value={currentPassword} 
                      onChange={(e) => setCurrentPassword(e.target.value)} 
                      placeholder="Enter current password" 
                      className="w-full bg-[#020617] border border-slate-700 focus:border-rose-500 text-slate-200 rounded-xl px-4 py-3 outline-none transition-colors text-sm" 
                    />
                    <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                      {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 ml-1">New Password</label>
                    <div className="relative">
                      <input 
                        type={showPassword ? "text" : "password"} 
                        value={newPassword} 
                        onChange={(e) => setNewPassword(e.target.value)} 
                        placeholder="At least 6 characters" 
                        className="w-full bg-[#020617] border border-slate-700 focus:border-rose-500 text-slate-200 rounded-xl px-4 py-3 outline-none transition-colors text-sm" 
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 ml-1">Confirm New Password</label>
                    <div className="relative">
                      <input 
                        type={showConfirmPassword ? "text" : "password"} 
                        value={confirmPassword} 
                        onChange={(e) => setConfirmPassword(e.target.value)} 
                        placeholder="Confirm new password" 
                        className="w-full bg-[#020617] border border-slate-700 focus:border-rose-500 text-slate-200 rounded-xl px-4 py-3 outline-none transition-colors text-sm" 
                      />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                {passwordError && (
                  <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-center font-medium">{passwordError}</p>
                )}
                {passwordSuccess && (
                  <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center font-medium">{passwordSuccess}</p>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleUpdatePassword}
                    disabled={!currentPassword || !newPassword || !confirmPassword || isUpdatingPassword}
                    className="px-6 py-3 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-rose-500/20"
                  >
                    {isUpdatingPassword ? 'Updating Password...' : 'Update Password'}
                  </button>
                </div>
              </div>
            </div>

            {/* About & Policies */}
            <div className="bg-[#0f172a]/80 backdrop-blur-md border border-slate-800 rounded-3xl p-6 shadow-xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-slate-500/10 flex items-center justify-center shrink-0">
                  <Info size={20} className="text-slate-400" />
                </div>
                <div>
                  <h3 className="text-xl font-display font-bold text-white">About TUNBORZY ACADEMY</h3>
                  <p className="text-xs text-slate-400">Platform information and legal policies</p>
                </div>
              </div>
              
              <div className="space-y-4 max-w-2xl">
                <div className="flex items-center justify-between p-4 rounded-xl bg-[#020617]/50 border border-slate-800/50">
                  <span className="text-sm font-semibold text-slate-300">Application Version</span>
                  <span className="text-sm font-mono text-indigo-400 font-bold">v1.0.0 (Web)</span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <button 
                    onClick={() => setActiveModal('privacy')}
                    className="py-3 px-4 rounded-xl bg-[#020617]/50 border border-slate-800 hover:border-indigo-500/40 text-slate-300 text-xs font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    <FileText size={16} className="text-indigo-400" /> Privacy Policy
                  </button>
                  <button 
                    onClick={() => setActiveModal('terms')}
                    className="py-3 px-4 rounded-xl bg-[#020617]/50 border border-slate-800 hover:border-indigo-500/40 text-slate-300 text-xs font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    <FileText size={16} className="text-indigo-400" /> Terms & Conditions
                  </button>
                </div>
              </div>
            </div>

            {/* Logout Section */}
            <div className="bg-rose-500/5 border border-rose-500/20 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
              <div>
                <h3 className="text-lg font-display font-bold text-rose-400 mb-1">Sign Out</h3>
                <p className="text-sm text-slate-400">End your current session securely.</p>
              </div>
              <button 
                onClick={() => setShowLogoutDialog(true)}
                className="w-full sm:w-auto px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl transition-colors shadow-lg shadow-rose-500/20 flex items-center justify-center gap-2"
              >
                <LogOut size={18} /> Log Out
              </button>
            </div>

          </div>
        </motion.div>

        {/* Floating Save Button for Profile */}
        <AnimatePresence>
          {hasChanges && (
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.9 }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-[#0f172a]/95 backdrop-blur-xl border border-indigo-500/30 p-3 pr-4 rounded-full shadow-[0_10px_40px_-10px_rgba(99,102,241,0.3)]"
            >
              <div className="pl-3 text-sm font-semibold text-white">Unsaved profile changes</div>
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="bg-indigo-500 hover:bg-indigo-400 text-white px-6 py-2 rounded-full font-bold transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/20"
              >
                {isSaving ? 'Saving...' : <><Save size={16} /> Save Changes</>}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success Toast */}
        <AnimatePresence>
          {showSaveSuccess && (
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.9 }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-emerald-500/90 backdrop-blur-xl border border-emerald-400 text-white px-6 py-3 rounded-full shadow-[0_10px_40px_-10px_rgba(16,185,129,0.3)]"
            >
              <Check size={18} />
              <span className="text-sm font-bold">Profile updated successfully</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Logout Dialog */}
        <AnimatePresence>
          {showLogoutDialog && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-[#020617]/80 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }} 
                animate={{ opacity: 1, scale: 1, y: 0 }} 
                exit={{ opacity: 0, scale: 0.9, y: 20 }} 
                className="relative w-full max-w-sm bg-[#0f172a] border border-slate-800 rounded-3xl p-6 shadow-2xl"
              >
                <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center mb-4 mx-auto">
                  <LogOut size={24} className="text-rose-500" />
                </div>
                <h3 className="text-xl font-display font-bold text-white text-center mb-2">Log Out?</h3>
                <p className="text-slate-400 text-center text-sm mb-8">Are you sure you want to log out of your account?</p>
                
                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowLogoutDialog(false)}
                    className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={onLogout}
                    className="flex-1 py-3 px-4 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-semibold transition-colors shadow-lg shadow-rose-500/20"
                  >
                    Log Out
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Privacy Policy & Terms Modal */}
        <AnimatePresence>
          {activeModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#020617]/85 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }} 
                animate={{ opacity: 1, scale: 1 }} 
                exit={{ opacity: 0, scale: 0.95 }} 
                className="relative w-full max-w-2xl bg-[#0f172a] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
              >
                <div className="flex items-center justify-between p-6 border-b border-slate-800">
                  <h3 className="text-xl font-display font-bold text-white">
                    {activeModal === 'privacy' ? 'Privacy Policy' : 'Terms & Conditions'}
                  </h3>
                  <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800">
                    <X size={20} />
                  </button>
                </div>

                <div className="p-6 space-y-4 overflow-y-auto text-slate-300 text-sm leading-relaxed">
                  {activeModal === 'privacy' ? (
                    <>
                      <p>Last updated: August 2026</p>
                      <h4 className="font-bold text-white mt-4">1. Information We Collect</h4>
                      <p>Tunborzy Academy processes account registration details (such as your full name, email address, student ID, and university profile), academic activity logs, CBT test attempts and scores, uploaded educational materials, and AI interaction history.</p>
                      <h4 className="font-bold text-white mt-4">2. How We Use Your Data</h4>
                      <p>Your data is used strictly to provide educational services, personalize your learning experience, track academic progress, and manage secure authentication.</p>
                      <h4 className="font-bold text-white mt-4">3. Payments & Third-Party Services</h4>
                      <p>Payment transactions are handled securely through accredited third-party payment providers (such as Flutterwave). We do not store your complete credit card or banking credentials on our servers.</p>
                      <h4 className="font-bold text-white mt-4">4. Data Security</h4>
                      <p>We implement industry-standard security protocols and Supabase authentication with row-level security (RLS) to ensure your personal data is protected against unauthorized access.</p>
                    </>
                  ) : (
                    <>
                      <p>Last updated: August 2026</p>
                      <h4 className="font-bold text-white mt-4">1. Acceptance of Terms</h4>
                      <p>By accessing and using Tunborzy Academy, you agree to abide by these Terms and Conditions and our academic honor code.</p>
                      <h4 className="font-bold text-white mt-4">2. Student Accounts & Integrity</h4>
                      <p>You are responsible for maintaining the confidentiality of your account credentials. CBT exams and drilling sessions must be completed with academic integrity.</p>
                      <h4 className="font-bold text-white mt-4">3. Intellectual Property</h4>
                      <p>All academic materials, lectures, CBT question banks, and platform software are protected by copyright and intellectual property laws belonging to Tunborzy Academy and authorized educators.</p>
                      <h4 className="font-bold text-white mt-4">4. Limitation of Liability</h4>
                      <p>Tunborzy Academy is provided on an "as is" and "as available" basis for educational and examination preparation purposes.</p>
                    </>
                  )}
                </div>

                <div className="p-4 border-t border-slate-800 bg-[#020617]/50 flex justify-end">
                  <button 
                    onClick={() => setActiveModal(null)}
                    className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl text-xs font-bold transition-colors"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </DashboardLayout>
  );
}
