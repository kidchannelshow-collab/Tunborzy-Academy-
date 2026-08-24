import React, { useState, ReactNode, useEffect } from 'react';
import AdminSidebar from './AdminSidebar';
import { Menu, Bell } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useProfile } from '../../lib/useProfile';

interface AdminDashboardLayoutProps {
  children: ReactNode;
  onLogout: () => void;
  currentView: string;
  onNavigate: (view: string) => void;
}

export default function AdminDashboardLayout({ children, onLogout, currentView, onNavigate }: AdminDashboardLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { profile } = useProfile();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!profile?.id || !supabase) {
      setUnreadCount(0);
      return;
    }

    let mounted = true;
    const loadUnread = async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('is_read', false);
      if (!error && mounted) setUnreadCount(count || 0);
    };

    loadUnread();
    const channel = supabase.channel(`admin_header_notifications_${profile.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}`
      }, loadUnread)
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  return (
    <div className="min-h-[100dvh] bg-[#020617] flex">
      <AdminSidebar 
        isOpen={isSidebarOpen} 
        setIsOpen={setIsSidebarOpen} 
        onLogout={onLogout} 
        currentView={currentView}
        onNavigate={onNavigate}
      />
      
      <div className="flex-1 min-w-0 lg:pl-72 flex flex-col min-h-[100dvh]">
        <header className="sticky top-0 z-30 bg-[#0f172a]/80 backdrop-blur-md border-b border-slate-800/50 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 rounded-lg bg-slate-800/50 text-slate-300 hover:text-white transition-colors"
              aria-label="Open admin menu"
            >
              <Menu size={24} />
            </button>
            <span className="font-display font-bold text-white uppercase tracking-wider">Control Center</span>
          </div>

          <button
            onClick={() => onNavigate('announcements')}
            className="relative p-2.5 rounded-xl bg-slate-800/60 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            title="Announcement Manager"
            aria-label="Open Announcement Manager"
          >
            <Bell size={21} />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-[#0f172a]">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
