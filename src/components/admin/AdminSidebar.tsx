import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, Users, UserCog, BookOpen, Database, Bot, LineChart, Settings, MessageSquare, Bell,
  History, LogOut, X, ChevronRight, Star, Activity, FileCheck, FileText, Building2, GraduationCap, Tag
} from 'lucide-react';

interface AdminSidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onLogout: () => void;
  currentView: string;
  onNavigate: (view: string) => void;
}

export default function AdminSidebar({ isOpen, setIsOpen, onLogout, currentView, onNavigate }: AdminSidebarProps) {
  const menuItems = [
    { icon: LayoutDashboard, label: 'System Overview', id: 'overview' },
    { icon: Users, label: 'User Management', id: 'users' },
    { icon: UserCog, label: 'Lecturer Management', id: 'lecturers' },
    { icon: BookOpen, label: 'Course Management', id: 'courses' },
    { icon: FileText, label: 'UTME CBT Manager', id: 'utme' },
    { icon: Building2, label: 'Post-UTME Manager', id: 'post-utme' },
    { icon: FileCheck, label: 'Pending Reviews', id: 'reviews' },
    { icon: Bot, label: 'AI Management', id: 'ai' },
    { icon: MessageSquare, label: 'Conversations', id: 'conversations' },
    { icon: Star, label: 'AI Feedback', id: 'feedback' },
    { icon: Activity, label: 'AI Performance', id: 'ai_performance' },
    { icon: LineChart, label: 'Analytics', id: 'analytics' },
    { icon: GraduationCap, label: 'Undergraduate Performance', id: 'ug_performance' },
    { icon: Tag, label: 'Partnership Management', id: 'partnerships' },
    { icon: Bell, label: 'Announcement Manager', id: 'announcements' },
    { icon: Settings, label: 'System Settings', id: 'settings' },
    { icon: History, label: 'Audit Log', id: 'audit' },
  ];

  const handleNavigate = (id: string) => {
    onNavigate(id);
    setIsOpen(false);
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
      <div className="p-6 flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold bg-gradient-to-r from-violet-400 to-indigo-600 bg-clip-text text-transparent uppercase tracking-wider">
          TUNBORZY Admin
        </h1>
        <button 
          onClick={() => setIsOpen(false)}
          className="lg:hidden text-slate-400 hover:text-white"
        >
          <X size={24} />
        </button>
      </div>

      <div className="px-4 pb-6 flex-1">
        <p className="px-4 text-xs font-poppins font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Control Center
        </p>
        <ul className="space-y-1">
          {menuItems.map((item, index) => {
            const isActive = currentView === item.id;
            return (
              <li key={index}>
                <button
                  onClick={() => handleNavigate(item.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-body font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' 
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon size={20} className={isActive ? 'text-indigo-400' : 'text-slate-400'} />
                    {item.label}
                  </div>
                  {isActive && <ChevronRight size={16} className="text-indigo-400" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="p-4 mt-auto border-t border-slate-800/50">
        <button 
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-body font-medium text-rose-500 hover:bg-rose-500/10 transition-all"
        >
          <LogOut size={20} />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-[#020617]/80 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <motion.aside
        className={`fixed top-0 left-0 h-[100dvh] w-72 bg-[#0f172a]/95 backdrop-blur-xl border-r border-slate-800/50 z-50 flex flex-col lg:translate-x-0 transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent />
      </motion.aside>
    </>
  );
}
