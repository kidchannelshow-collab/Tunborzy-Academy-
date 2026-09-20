import { useState } from 'react';
import { Menu, X, GraduationCap, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGeneralSettings } from '../lib/platformSettings';

export default function Navbar({ onSignUp, onLogin }: { onSignUp?: () => void, onLogin?: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const { settings } = useGeneralSettings();

  // The saved platform name is a single string ("Tunborzy Academy"). The brand
  // mark has always been two-tone, so the first word stays white and the
  // remainder keeps the accent colour — the value is dynamic, the styling is not.
  const nameWords = settings.platform_name.trim().split(/\s+/).filter(Boolean);
  const nameLead = (nameWords[0] || 'Tunborzy').toUpperCase();
  const nameTail = nameWords.slice(1).join(' ').toUpperCase();

  const links = ['Home', 'About', 'Contact'];

  return (
    <motion.nav 
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="fixed w-full z-50 top-0 bg-[#020617]/90 backdrop-blur-md grid-border border-t-0 border-x-0"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
        <div className="flex justify-between items-center h-20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
              <GraduationCap className="w-6 h-6 text-amber-500" />
            </div>
            <span className="font-black tracking-tighter text-xl text-white antialiased">
              {nameLead} {nameTail && <span className="accent-text">{nameTail}</span>}
            </span>
          </div>
          
          <div className="hidden md:flex items-center gap-8 text-sm font-poppins font-medium text-slate-400">
            {links.map((link, i) => (
              <motion.a 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 * i + 0.3 }}
                key={link} 
                href={`#${link.toLowerCase()}`} 
                className="hover:text-white transition-colors nav-link"
              >
                {link}
              </motion.a>
            ))}
          </div>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="hidden md:flex items-center gap-4"
          >
            <motion.button 
              onClick={() => window.dispatchEvent(new Event('open-global-search'))}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 text-slate-400 hover:text-white transition-colors flex items-center justify-center rounded-full hover:bg-white/5"
            >
              <Search size={20} />
            </motion.button>
            <motion.button 
              onClick={onLogin}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="text-sm font-action font-semibold hover:text-white transition-colors px-4 py-2"
            >
              Login
            </motion.button>
            <motion.button 
              onClick={onSignUp}
              whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(245, 158, 11, 0.4)" }}
              whileTap={{ scale: 0.95 }}
              className="bg-amber-500 text-slate-950 px-6 py-2 rounded-full text-sm font-action font-semibold shadow-lg shadow-amber-500/20 hover:bg-amber-400 transition-all duration-300"
            >
              Sign Up
            </motion.button>
          </motion.div>

          <button 
            className="md:hidden text-slate-400 hover:text-white p-2" 
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden grid-border border-x-0 border-t-0 bg-[#020617]/95 backdrop-blur-md overflow-hidden"
          >
            <div className="px-4 pt-4 pb-6 space-y-4">
              {links.map(link => (
                <a 
                  key={link} 
                  href={`#${link.toLowerCase()}`} 
                  onClick={() => setIsOpen(false)}
                  className="block text-base font-poppins font-medium text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors"
                >
                  {link}
                </a>
              ))}
              <div className="pt-4 flex flex-col gap-3 grid-border border-x-0 border-b-0 border-t">
                <button onClick={() => { setIsOpen(false); window.dispatchEvent(new Event('open-global-search')); }} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-800/50 text-slate-300 font-action font-semibold hover:bg-slate-800 transition-colors">
                  <Search size={18} /> Search
                </button>
                <button onClick={() => { setIsOpen(false); onLogin?.(); }} className="w-full text-center py-3 rounded-xl border border-slate-700 text-slate-300 font-action font-semibold hover:bg-slate-800 transition-colors">
                  Login
                </button>
                <button onClick={() => { setIsOpen(false); onSignUp?.(); }} className="w-full text-center py-3 rounded-xl bg-amber-500 text-slate-950 font-action font-semibold hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20">
                  Sign Up
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
