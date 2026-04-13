// Zugriffsschicht für checkins_v2
import { CheckinV2 } from './checkins_v2.types';
import { createServerSupabaseServiceClient } from '@/lib/serverSupabase';

const supabase = createServerSupabaseServiceClient();
const TABLE = 'checkins_v2';

export async function insertCheckinV2(entry: Omit<CheckinV2, 'id' | 'created_at'>): Promise<CheckinV2> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .insert([{ ...entry, created_at: now }])
    .select()
    .maybeSingle();
  if (error || !data) throw new Error('DB_INSERT_FAILED');
  return data as CheckinV2;
}

export async function getCheckinsV2ForMember(member_id: string): Promise<CheckinV2[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('member_id', member_id)
    .order('checkin_time', { ascending: false });
  if (error || !data) return [];
  return data as CheckinV2[];
}

export async function getCheckinsV2ForMemberOnDay(member_id: string, date: string): Promise<CheckinV2[]> {
  // date: YYYY-MM-DD
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('member_id', member_id)
    .gte('checkin_time', date + 'T00:00:00.000Z')
    .lte('checkin_time', date + 'T23:59:59.999Z');
  if (error || !data) return [];
  return data as CheckinV2[];
}
