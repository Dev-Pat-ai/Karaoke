import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { roomConfigurationIssue, supabaseConfiguration } from './config';

let client: SupabaseClient | undefined;
let sessionRequest: Promise<void> | undefined;

// No client is constructed at module import or during a credential-free build.
export function getSupabase() {
  if (roomConfigurationIssue) throw new Error(roomConfigurationIssue);
  client ??= createClient(supabaseConfiguration.url, supabaseConfiguration.key);
  return client;
}

export async function ensureRoomSession() {
  if (!sessionRequest) {
    sessionRequest = (async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!data.session) {
        const { error: signInError } = await supabase.auth.signInAnonymously();
        if (signInError) throw new Error('Room sign-in failed. Enable Anonymous Sign-Ins in Supabase Auth and check your connection.');
      }
    })().finally(() => { sessionRequest = undefined; });
  }
  await sessionRequest;
  return getSupabase();
}

export function getRoomErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Room operation failed. Check your Supabase connection, schema, and RLS permissions (see SETUP.md).';
}
