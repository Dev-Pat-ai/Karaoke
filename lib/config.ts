export interface SupabaseConfiguration {
  url: string;
  key: string;
  issue: string | null;
}

export function validateSupabaseConfiguration(url: string, key: string): SupabaseConfiguration {
  const result = { url: url.trim(), key: key.trim(), issue: null as string | null };
  if (!result.url || !result.key) {
    result.issue = 'Shared rooms need NEXT_PUBLIC_SUPABASE_URL and a public Supabase key in .env.local. See SETUP.md.';
    return result;
  }
  try {
    const parsed = new URL(result.url);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if ((parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
      throw new Error('Invalid URL');
    }
  } catch {
    result.issue = 'NEXT_PUBLIC_SUPABASE_URL must be an HTTPS project URL (HTTP is allowed for localhost).';
    return result;
  }
  if (result.key.startsWith('sb_publishable_') && result.key.length > 20) return result;
  try {
    const payload = JSON.parse(atob(result.key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.role === 'anon') return result;
  } catch { /* Invalid or non-public keys are rejected below. */ }
  result.issue = 'Use a Supabase publishable key or legacy anon key. Secret and service_role keys must never be used in NEXT_PUBLIC_ variables.';
  return result;
}

export const supabaseConfiguration = validateSupabaseConfiguration(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
);

const demoSetting = process.env.NEXT_PUBLIC_DEMO_MODE?.trim();
export const roomConfigurationIssue = demoSetting === 'true'
  ? 'Demo mode is enabled. Shared rooms and cross-device synchronization are disabled.'
  : demoSetting && demoSetting !== 'false'
    ? 'NEXT_PUBLIC_DEMO_MODE must be true, false, or empty. See SETUP.md.'
    : supabaseConfiguration.issue;
export const isDemoMode = Boolean(roomConfigurationIssue);
export const hasYouTubeApiKey = Boolean(process.env.NEXT_PUBLIC_YOUTUBE_API_KEY?.trim());
