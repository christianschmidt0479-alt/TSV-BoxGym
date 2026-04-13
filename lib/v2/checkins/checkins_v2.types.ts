// Typdefinitionen für checkins_v2
export interface CheckinV2 {
  id: string;
  member_id: string;
  checkin_time: string;
  checkin_mode: 'normal' | 'holiday';
  effective_group: string;
  selected_group?: string;
  created_at: string;
}
