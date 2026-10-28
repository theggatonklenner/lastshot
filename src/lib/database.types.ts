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
};

type ProfileRow = {
  created_at: string;
  display_name: string | null;
  email: string;
  id: string;
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
export type { EventStatus, EventType, GalleryVisibility, ModerationStatus, RevealMode };
