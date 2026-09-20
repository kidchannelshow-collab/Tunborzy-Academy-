import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

/**
 * General platform settings — the single source of truth.
 *
 * `platform_settings` (migration 0047) stores one row per category with a JSONB
 * `settings` blob. The 'general' row holds the platform identity and the
 * maintenance flag.
 *
 * This module is a tiny shared store rather than a hook that fetches on its own:
 * the maintenance gate in App.tsx, the Navbar and the Footer all need the same
 * values, and without a shared cache each would issue its own query on every
 * mount. One request is fetched, cached, and handed to every consumer.
 *
 * Fallbacks matter here: if the row is missing, the query fails, or a field is
 * blank, the platform must keep working with sensible defaults rather than
 * render an empty brand or crash.
 */

export interface GeneralSettings {
  platform_name: string;
  platform_description: string;
  support_email: string;
  support_phone: string;
  maintenance_mode: boolean;
}

/**
 * Used until (or unless) the database answers. These match the values seeded by
 * migration 0047 so a first paint never shows an empty shell.
 */
export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  platform_name: 'Tunborzy Academy',
  platform_description: 'Excellence in Academic and CBT Preparation',
  support_email: 'support@tunborzy.edu.ng',
  support_phone: '+234 800 000 0000',
  maintenance_mode: false,
};

let cache: GeneralSettings = DEFAULT_GENERAL_SETTINGS;
let hasLoaded = false;
let inflight: Promise<GeneralSettings> | null = null;
const listeners = new Set<(settings: GeneralSettings) => void>();

function emit() {
  for (const listener of listeners) listener(cache);
}

/** Normalise a raw JSONB blob into a complete, correctly-typed settings object. */
function coerce(raw: any): GeneralSettings {
  const value = raw && typeof raw === 'object' ? raw : {};
  return {
    platform_name: String(value.platform_name ?? '').trim() || DEFAULT_GENERAL_SETTINGS.platform_name,
    platform_description: String(value.platform_description ?? '').trim(),
    support_email: String(value.support_email ?? '').trim() || DEFAULT_GENERAL_SETTINGS.support_email,
    // The seed in 0047 used the key `contact_phone`; the settings form uses
    // `support_phone`. Accept either so an older row is not silently ignored.
    support_phone:
      String(value.support_phone ?? value.contact_phone ?? '').trim() ||
      DEFAULT_GENERAL_SETTINGS.support_phone,
    maintenance_mode: value.maintenance_mode === true,
  };
}

export function getCachedGeneralSettings(): GeneralSettings {
  return cache;
}

/**
 * Fetches the 'general' row. Concurrent callers share one request. A failure is
 * swallowed deliberately — this drives branding and a maintenance gate, and a
 * transient query error must not blank the Navbar or lock the whole platform.
 */
export function loadGeneralSettings(): Promise<GeneralSettings> {
  if (inflight) return inflight;

  inflight = (async () => {
    if (!supabase) return cache;
    const { data, error } = await supabase
      .from('platform_settings')
      .select('settings')
      .eq('category', 'general')
      .maybeSingle();

    if (!error && data) {
      cache = coerce(data.settings);
    }
    hasLoaded = true;
    inflight = null;
    emit();
    return cache;
  })();

  return inflight;
}

/** Called after an admin saves, so the change applies without a full reload. */
export function refreshGeneralSettings(): Promise<GeneralSettings> {
  inflight = null;
  return loadGeneralSettings();
}

export function subscribeGeneralSettings(listener: (settings: GeneralSettings) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function hasLoadedGeneralSettings(): boolean {
  return hasLoaded;
}

/**
 * Subscribe to the shared settings. Returns the cached values immediately when
 * they are already available, so consumers do not flicker on every mount.
 */
export function useGeneralSettings(): { settings: GeneralSettings; loading: boolean } {
  const [settings, setSettings] = useState<GeneralSettings>(cache);
  const [loading, setLoading] = useState(!hasLoaded);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeGeneralSettings((next) => {
      if (active) setSettings(next);
    });

    loadGeneralSettings().finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { settings, loading };
}
