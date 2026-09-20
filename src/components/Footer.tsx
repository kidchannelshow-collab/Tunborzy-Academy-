import { GraduationCap } from 'lucide-react';
import { motion } from 'motion/react';
import { useGeneralSettings } from '../lib/platformSettings';

export default function Footer() {
  const { settings } = useGeneralSettings();

  // Same two-tone brand treatment as the Navbar, driven by the saved name.
  const nameWords = settings.platform_name.trim().split(/\s+/).filter(Boolean);
  const nameLead = (nameWords[0] || 'Tunborzy').toUpperCase();
  const nameTail = nameWords.slice(1).join(' ').toUpperCase();

  return (
    <motion.footer 
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
      id="contact" 
      className="bg-black grid-border border-x-0 border-b-0 text-slate-400"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20 grid-border border-y-0 border-x-0">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          
          <div className="md:col-span-1 space-y-4">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                <GraduationCap className="w-6 h-6 text-amber-500" />
              </div>
              <span className="font-black tracking-tighter text-xl text-white antialiased">
                {nameLead} {nameTail && <span className="accent-text">{nameTail}</span>}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-[#ffffff] max-w-xs font-promo font-bold">
              The most comprehensive academic portal for UTME, Post-UTME, and Undergraduate success in Nigeria.
            </p>
          </div>

          <div>
            <h4 className="font-display font-bold mb-6 text-[#3763b7]">Portals</h4>
            <ul className="space-y-4 text-sm font-poppins font-medium text-[#ffffff]">
              <li><a href="#portals" className="hover:text-white transition-colors">UTME Preparation</a></li>
              <li><a href="#portals" className="hover:text-white transition-colors">Post-UTME Screening</a></li>
              <li><a href="#portals" className="hover:text-white transition-colors">Undergraduate Support</a></li>
              <li><a href="#portals" className="hover:text-white transition-colors">Scholarship Resources</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-bold mb-6 text-[#3763b7]">Company</h4>
            <ul className="space-y-4 text-sm font-poppins font-medium text-[#ffffff]">
              <li><a href="#about" className="hover:text-white transition-colors">About Us</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-bold mb-6 text-[#3763b7]">Contact</h4>
            <ul className="space-y-4 text-sm font-poppins font-medium text-[#ffffff]">
              {/* Contact details come from System Settings. They used to be
                  hardcoded here and disagreed with the stored values. */}
              {settings.support_email && (
                <li>
                  <span className="text-[#f59e0b]">Email:</span>{' '}
                  <a
                    href={`mailto:${settings.support_email}`}
                    className="hover:text-white transition-colors break-all"
                  >
                    {settings.support_email}
                  </a>
                </li>
              )}
              {settings.support_phone && (
                <li>
                  <span className="text-[#f59e0b]">Phone:</span>{' '}
                  <a
                    href={`tel:${settings.support_phone.replace(/\s+/g, '')}`}
                    className="hover:text-white transition-colors font-space font-bold"
                  >
                    {settings.support_phone}
                  </a>
                </li>
              )}
              <li><span className="text-[#f59e0b]">Address:</span> Ilorin, Kwara State</li>
            </ul>
          </div>

        </div>

        <div className="pt-8 grid-border border-x-0 border-b-0 border-t flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] uppercase tracking-widest text-[#ffffff]">
          <p className="font-poppins font-medium">&copy; <span className="font-space font-bold">{new Date().getFullYear()}</span> {settings.platform_name}. Empowering Minds.</p>
          <div className="flex gap-8 font-poppins font-medium">
            <motion.a whileHover={{ y: -5 }} href="#" className="hover:text-slate-400 transition-colors">Privacy Policy</motion.a>
            <motion.a whileHover={{ y: -5 }} href="#" className="hover:text-slate-400 transition-colors">Terms of Service</motion.a>
            <motion.a whileHover={{ y: -5 }} href="#" className="hover:text-slate-400 transition-colors">Help Center</motion.a>
          </div>
        </div>
      </div>
    </motion.footer>
  );
}
