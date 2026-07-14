export interface Notification {
  id: string;
  user_id: string | null;
  kind: string;
  title: string | null;
  body: string | null;
  ref_table: string | null;
  ref_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface EmailTemplate {
  id: string;
  kind: string;
  name: string;
  subject: string | null;
  body: string | null;
  is_ai_recommended: boolean;
  created_by: string | null;
  created_at: string;
}
