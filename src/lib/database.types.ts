// Generated from the Supabase schema (supabase gen types), trimmed to what the app uses.
// Regenerate after schema changes: npx supabase gen types typescript --project-id <ref>
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type EventStatus = "draft" | "published" | "active" | "ended" | "archived";
type EventType = "wedding" | "birthday" | "party" | "school" | "concert" | "corporate" | "other";
type GalleryVisibility = "guests" | "public" | "private";
type ModerationStatus = "pending" | "approved" | "rejected";
type RevealMode = "live" | "scheduled" | "manual";
type UploadStatus = "pending" | "complete" | "failed";

type EventRow = {
  accent_color: string;
  access_code_hash: string | null;
  camera_roll_uploads_enabled: boolean;
  code: string;
  cover_image_path: string | null;
  created_at: string;
  date_stamp_enabled: boolean;
  description: string | null;
  end_time: string | null;
  ended_at: string | null;
  event_date: string | null;
  event_type: EventType;
  gallery_visibility: GalleryVisibility;
  guest_downloads_enabled: boolean;
  id: string;
  owner_id: string;
  photos_per_guest: number;
  published_at: string | null;
  require_approval: boolean;
  reveal_at: string | null;
  reveal_mode: RevealMode;
  revealed_at: string | null;
  show_guest_names: boolean;
  start_time: string | null;
  status: EventStatus;
  submissions_closed_at: string | null;
  theme: string;
  timezone: string;
  title: string;
  updated_at: string;
  suspended_at: string | null;
  suspended_reason: string | null;
  email_capture_enabled: boolean;
  keep_photos: boolean;
  retention_warned_at: string | null;
  plan: Plan;
  full_notified_at: string | null;
  bonus_shots: number;
  bonus_at: string | null;
  extra_guests: number;
  addon_frame: boolean;
  addon_branding: boolean;
  addon_storage: boolean;
  addon_sms: boolean;
  frame_text: string | null;
  frame_subtext: string | null;
  frame_color: "white" | "cream" | "black";
  brand_logo_path: string | null;
};

export type Addon = "frame" | "branding" | "storage" | "sms";

type SmsRow = {
  id: string;
  event_id: string;
  guest_id: string | null;
  phone: string;
  created_at: string;
  unsubscribed_at: string | null;
  sending_started_at: string | null;
  sent_at: string | null;
  attempts: number;
  last_error: string | null;
  view_token_hash: string | null;
};

export type Plan = "free" | "small" | "party" | "big" | "unlimited";

type PaymentRow = {
  id: string;
  event_id: string | null;
  user_id: string | null;
  kind: "plan" | "seats" | "addon";
  addon: Addon | null;
  plan: Exclude<Plan, "free"> | null;
  extra_guests: number;
  amount_cents: number;
  currency: string;
  stripe_session_id: string;
  stripe_payment_intent: string | null;
  status: "pending" | "paid" | "expired" | "refunded";
  receipt_email: string | null;
  created_at: string;
  paid_at: string | null;
};

type GuestRow = {
  blocked: boolean;
  created_at: string;
  display_name: string | null;
  event_id: string;
  guest_token_hash: string;
  id: string;
  last_active_at: string;
  photos_submitted: number;
  user_id: string | null;
};

type PhotoRow = {
  captured_at: string | null;
  client_upload_id: string;
  created_at: string;
  display_path: string | null;
  event_id: string;
  file_size: number | null;
  flag_reason: string | null;
  flagged: boolean;
  guest_id: string;
  height: number | null;
  id: string;
  moderation_status: ModerationStatus;
  source: string;
  storage_path: string | null;
  thumbnail_path: string | null;
  upload_status: UploadStatus;
  uploaded_at: string | null;
  width: number | null;
  watermarked: boolean;
};

type ProfileRow = {
  is_admin: boolean;
  created_at: string;
  display_name: string | null;
  email: string;
  id: string;
};

type GuestEmailRow = {
  id: string;
  event_id: string;
  guest_id: string | null;
  email: string;
  created_at: string;
  unsubscribed_at: string | null;
  sending_started_at: string | null;
  sent_at: string | null;
  attempts: number;
  last_error: string | null;
  view_token_hash: string | null;
};

type MemberRow = { event_id: string; user_id: string; added_by: string | null; created_at: string };
type InviteRow = {
  id: string;
  event_id: string;
  email: string;
  token_hash: string;
  invited_by: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
};
type ReportRow = {
  id: string;
  photo_id: string;
  event_id: string;
  reporter_key: string;
  reason: "inappropriate" | "privacy" | "other";
  details: string | null;
  created_at: string;
  resolved_at: string | null;
};
type ErrorRow = {
  id: string;
  fingerprint: string;
  source: "server" | "client";
  message: string;
  path: string | null;
  digest: string | null;
  detail: string | null;
  count: number;
  first_seen_at: string;
  last_seen_at: string;
  notified_at: string | null;
  resolved_at: string | null;
};

type SettingRow = { event_id: string; id: string; setting_key: string; setting_value: Json };

type Partialize<T> = { [K in keyof T]?: T[K] };

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" };
  public: {
    Tables: {
      events: {
        Row: EventRow;
        Insert: Partialize<EventRow> & { owner_id: string; title: string };
        Update: Partialize<EventRow>;
        Relationships: [];
      };
      event_guests: {
        Row: GuestRow;
        Insert: Partialize<GuestRow> & { event_id: string; guest_token_hash: string };
        Update: Partialize<GuestRow>;
        Relationships: [];
      };
      photos: {
        Row: PhotoRow;
        Insert: Partialize<PhotoRow> & { event_id: string; guest_id: string; client_upload_id: string };
        Update: Partialize<PhotoRow>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: Partialize<ProfileRow> & { id: string; email: string };
        Update: Partialize<ProfileRow>;
        Relationships: [];
      };
      event_settings: {
        Row: SettingRow;
        Insert: Partialize<SettingRow> & { event_id: string; setting_key: string };
        Update: Partialize<SettingRow>;
        Relationships: [];
      };
      guest_emails: {
        Row: GuestEmailRow;
        Insert: Partialize<GuestEmailRow> & { event_id: string; email: string };
        Update: Partialize<GuestEmailRow>;
        Relationships: [];
      };
      event_members: {
        Row: MemberRow;
        Insert: Partialize<MemberRow> & { event_id: string; user_id: string };
        Update: Partialize<MemberRow>;
        Relationships: [];
      };
      event_invites: {
        Row: InviteRow;
        Insert: Partialize<InviteRow> & { event_id: string; email: string; token_hash: string };
        Update: Partialize<InviteRow>;
        Relationships: [];
      };
      photo_reports: {
        Row: ReportRow;
        Insert: Partialize<ReportRow> & { photo_id: string; event_id: string; reporter_key: string; reason: ReportRow["reason"] };
        Update: Partialize<ReportRow>;
        Relationships: [];
      };
      app_errors: {
        Row: ErrorRow;
        Insert: Partialize<ErrorRow> & { fingerprint: string; source: ErrorRow["source"]; message: string };
        Update: Partialize<ErrorRow>;
        Relationships: [];
      };
      guest_sms: {
        Row: SmsRow;
        Insert: Partialize<SmsRow> & { event_id: string; phone: string };
        Update: Partialize<SmsRow>;
        Relationships: [];
      };
      payments: {
        Row: PaymentRow;
        Insert: Partialize<PaymentRow> & { amount_cents: number; stripe_session_id: string };
        Update: Partialize<PaymentRow>;
        Relationships: [];
      };
      rate_limits: {
        Row: { count: number; key: string; window_start: string };
        Insert: { count?: number; key: string; window_start: string };
        Update: { count?: number; key?: string; window_start?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      check_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number };
        Returns: boolean;
      };
      claim_photo_slot: {
        Args: { p_captured_at: string; p_client_upload_id: string; p_guest_id: string; p_source: string };
        Returns: { photo_id: string; result: string; shots_limit: number; shots_used: number }[];
      };
      complete_photo_upload: {
        Args: {
          p_display_path: string;
          p_file_size: number;
          p_height: number;
          p_photo_id: string;
          p_storage_path: string;
          p_thumbnail_path: string;
          p_width: number;
        };
        Returns: PhotoRow;
      };
      guest_join: {
        Args: { p_access_code: string | null; p_display_name: string | null; p_event_id: string; p_token_hash: string };
        Returns: GuestRow;
      };
      release_photo_slot: { Args: { p_photo_id: string }; Returns: undefined };
      release_stale_uploads: { Args: { p_guest_id: string }; Returns: number };
      set_event_access_code: { Args: { p_code: string; p_event_id: string }; Returns: undefined };
      event_stats: {
        Args: { p_event_ids: string[] };
        Returns: { event_id: string; guests: number; photos: number; pending_review: number; rejected: number; flagged: number }[];
      };
      is_platform_admin: { Args: never; Returns: boolean };
      is_event_organiser: { Args: { p_event_id: string }; Returns: boolean };
      accept_event_invite: { Args: { p_token_hash: string; p_user_id: string }; Returns: string };
      report_photo: {
        Args: { p_photo_id: string; p_event_id: string; p_reporter_key: string; p_reason: string; p_details: string | null };
        Returns: { first_report: boolean; report_count: number; hidden: boolean }[];
      };
      events_due_for_cleanup: { Args: { p_limit: number }; Returns: { id: string; owner_id: string; title: string }[] };
      events_due_for_retention_warning: {
        Args: { p_limit: number };
        Returns: { id: string; owner_id: string; title: string; delete_after: string }[];
      };
      log_app_error: {
        Args: {
          p_fingerprint: string;
          p_source: string;
          p_message: string;
          p_path: string | null;
          p_digest: string | null;
          p_detail: string | null;
        };
        Returns: boolean;
      };
      admin_overview: { Args: never; Returns: Json };
      admin_revenue: { Args: never; Returns: Json };
      add_guest_phone: { Args: { p_guest_id: string; p_phone: string }; Returns: SmsRow };
      claim_gallery_sms: {
        Args: { p_event_id: string | null; p_limit: number };
        Returns: { id: string; event_id: string; phone: string; event_code: string; event_title: string }[];
      };
      fulfil_payment: {
        Args: { p_session_id: string; p_payment_intent: string | null; p_email: string | null };
        Returns: PaymentRow;
      };
      admin_events: {
        Args: { p_search: string | null; p_status: string | null; p_limit: number; p_offset: number };
        Returns: {
          id: string;
          code: string;
          title: string;
          status: EventStatus;
          suspended_at: string | null;
          created_at: string;
          event_date: string | null;
          owner_id: string;
          owner_email: string;
          guests: number;
          photos: number;
          emails: number;
          total_count: number;
        }[];
      };
      admin_organisers: {
        Args: { p_search: string | null; p_limit: number; p_offset: number };
        Returns: {
          id: string;
          email: string;
          display_name: string | null;
          is_admin: boolean;
          created_at: string;
          last_sign_in_at: string | null;
          confirmed: boolean;
          events: number;
          photos: number;
          total_count: number;
        }[];
      };
      add_guest_email: { Args: { p_guest_id: string; p_email: string }; Returns: GuestEmailRow };
      claim_gallery_emails: {
        Args: { p_event_id: string | null; p_limit: number };
        Returns: { id: string; event_id: string; email: string; event_code: string; event_title: string }[];
      };
      event_email_stats: {
        Args: { p_event_id: string };
        Returns: { subscribed: number; sent: number; waiting: number; unsubscribed: number; failed: number }[];
      };
      event_upload_timeline: {
        Args: { p_event_id: string; p_bucket_minutes?: number };
        Returns: { bucket: string; photos: number; camera: number; library: number }[];
      };
    };
    Enums: {
      event_status: EventStatus;
      event_type: EventType;
      gallery_visibility: GalleryVisibility;
      moderation_status: ModerationStatus;
      reveal_mode: RevealMode;
      upload_status: UploadStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type EventRecord = EventRow;
export type GuestRecord = GuestRow;
export type PhotoRecord = PhotoRow;
export type GuestEmailRecord = GuestEmailRow;
export type ProfileRecord = ProfileRow;
export type ReportRecord = ReportRow;
export type ErrorRecord = ErrorRow;
export type { EventStatus, EventType, GalleryVisibility, ModerationStatus, RevealMode };
export type PaymentRecord = PaymentRow;
export type SmsRecord = SmsRow;
