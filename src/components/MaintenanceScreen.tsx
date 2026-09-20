import React from 'react';
import { Wrench, Mail, Phone, Clock, ShieldCheck } from 'lucide-react';
import { useGeneralSettings } from '../lib/platformSettings';

/**
 * Full-page maintenance notice.
 *
 * Rendered app-wide by App.tsx in place of every normal route while
 * `platform_settings.general.maintenance_mode` is true — see the gate there.
 * Admins are never shown this, so they can sign in and switch it back off.
 *
 * Values come from the shared platform-settings store, so the name and contact
 * details here are whatever the admin saved. Contact lines are hidden rather
 * than rendered blank when a value is missing.
 */
export default function MaintenanceScreen() {
  const { settings } = useGeneralSettings();

  const hasEmail = !!settings.support_email;
  const hasPhone = !!settings.support_phone;

  return (
    <div className="min-h-[100dvh] bg-[#020617] flex items-center justify-center px-4 py-16 selection:bg-amber-500/30">
      <div className="w-full max-w-2xl">
        <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-[#0f172a] p-8 sm:p-12 text-center shadow-2xl">
          {/* Ambient accent, matching the platform's navy + amber identity */}
          <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />

          <div className="relative z-10">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10">
              <Wrench size={36} className="text-amber-400" />
            </div>

            <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-400">
              <Clock size={13} /> Scheduled Maintenance
            </span>

            <h1 className="mt-5 font-display text-3xl font-bold text-white sm:text-4xl">
              {settings.platform_name}
            </h1>

            <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-slate-300">
              The platform is temporarily unavailable while we carry out maintenance. We will be
              back shortly — thank you for your patience.
            </p>

            {settings.platform_description && (
              <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-500">
                {settings.platform_description}
              </p>
            )}

            {(hasEmail || hasPhone) && (
              <div className="mt-8 rounded-2xl border border-slate-800 bg-[#020617]/60 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Need help in the meantime?
                </p>
                <div className="mt-3 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-8">
                  {hasEmail && (
                    <a
                      href={`mailto:${settings.support_email}`}
                      className="inline-flex items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-white"
                    >
                      <Mail size={16} className="text-blue-400 shrink-0" />
                      <span className="break-all">{settings.support_email}</span>
                    </a>
                  )}
                  {hasPhone && (
                    <a
                      href={`tel:${settings.support_phone.replace(/\s+/g, '')}`}
                      className="inline-flex items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-white"
                    >
                      <Phone size={16} className="text-blue-400 shrink-0" />
                      <span>{settings.support_phone}</span>
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-500">
              <ShieldCheck size={14} className="text-slate-600" />
              Administrators can still sign in to manage the platform.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
