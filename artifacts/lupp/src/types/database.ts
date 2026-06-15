import type { ANALYTICS_EVENT_TYPES, COMMENT_STATUS, STORE_MEMBER_ROLES, VIDEO_STATUS } from "@/lib/constants";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type VideoStatus = (typeof VIDEO_STATUS)[number];
export type CommentStatus = (typeof COMMENT_STATUS)[number];
export type StoreMemberRole = (typeof STORE_MEMBER_ROLES)[number];
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string | null;
          email: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      stores: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          slug: string;
          url: string | null;
          platform: string | null;
          segment: string | null;
          logo_url: string | null;
          primary_color: string;
          secondary_color: string;
          button_color: string;
          status: string;
          plan_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          slug: string;
          url?: string | null;
          platform?: string | null;
          segment?: string | null;
          logo_url?: string | null;
          primary_color?: string;
          secondary_color?: string;
          button_color?: string;
          status?: string;
          plan_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["stores"]["Insert"]>;
        Relationships: [];
      };
      store_members: {
        Row: { id: string; store_id: string; user_id: string; role: StoreMemberRole; created_at: string };
        Insert: { id?: string; store_id: string; user_id: string; role?: StoreMemberRole; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["store_members"]["Insert"]>;
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          store_id: string;
          external_id: string | null;
          name: string;
          description: string | null;
          price: number | null;
          compare_at_price: number | null;
          currency: string;
          image_url: string | null;
          product_url: string | null;
          platform: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["products"]["Row"]> & { store_id: string; name: string };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
        Relationships: [];
      };
      videos: {
        Row: {
          id: string;
          store_id: string;
          title: string;
          description: string | null;
          video_url: string | null;
          thumbnail_url: string | null;
          storage_path: string | null;
          provider: string;
          duration_seconds: number | null;
          aspect_ratio: string;
          status: VideoStatus;
          cta_label: string;
          is_feed_enabled: boolean;
          is_product_page_enabled: boolean;
          allow_likes: boolean;
          allow_comments: boolean;
          allow_sharing: boolean;
          is_featured: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["videos"]["Row"]> & { store_id: string; title: string };
        Update: Partial<Database["public"]["Tables"]["videos"]["Insert"]>;
        Relationships: [];
      };
      video_products: {
        Row: { id: string; video_id: string; product_id: string; is_primary: boolean; created_at: string };
        Insert: { id?: string; video_id: string; product_id: string; is_primary?: boolean; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["video_products"]["Insert"]>;
        Relationships: [];
      };
      widgets: {
        Row: {
          id: string;
          store_id: string;
          name: string;
          type: string;
          status: string;
          target: string | null;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["widgets"]["Row"]> & { store_id: string; name: string; type: string };
        Update: Partial<Database["public"]["Tables"]["widgets"]["Insert"]>;
        Relationships: [];
      };
      custom_pages: {
        Row: {
          id: string;
          store_id: string;
          name: string;
          slug: string;
          description: string | null;
          layout: string;
          status: string;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["custom_pages"]["Row"]> & { store_id: string; name: string; slug: string };
        Update: Partial<Database["public"]["Tables"]["custom_pages"]["Insert"]>;
        Relationships: [];
      };
      custom_page_videos: {
        Row: { id: string; page_id: string; video_id: string; sort_order: number; created_at: string };
        Insert: { id?: string; page_id: string; video_id: string; sort_order?: number; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["custom_page_videos"]["Insert"]>;
        Relationships: [];
      };
      comments: {
        Row: {
          id: string;
          store_id: string;
          video_id: string;
          author_name: string | null;
          author_email: string | null;
          body: string;
          status: CommentStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["comments"]["Row"]> & { store_id: string; video_id: string; body: string };
        Update: Partial<Database["public"]["Tables"]["comments"]["Insert"]>;
        Relationships: [];
      };
      video_likes: {
        Row: { id: string; video_id: string; store_id: string; visitor_id: string | null; created_at: string };
        Insert: { id?: string; video_id: string; store_id: string; visitor_id?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["video_likes"]["Insert"]>;
        Relationships: [];
      };
      analytics_events: {
        Row: {
          id: string;
          store_id: string;
          video_id: string | null;
          product_id: string | null;
          event_type: AnalyticsEventType;
          visitor_id: string | null;
          session_id: string | null;
          url: string | null;
          referrer: string | null;
          user_agent: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["analytics_events"]["Row"]> & { store_id: string; event_type: AnalyticsEventType };
        Update: Partial<Database["public"]["Tables"]["analytics_events"]["Insert"]>;
        Relationships: [];
      };
      integrations: {
        Row: {
          id: string;
          store_id: string;
          provider: string;
          status: string;
          external_store_id: string | null;
          credentials: Json;
          settings: Json;
          connected_at: string | null;
          last_sync_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["integrations"]["Row"]> & { store_id: string; provider: string };
        Update: Partial<Database["public"]["Tables"]["integrations"]["Insert"]>;
        Relationships: [];
      };
      plans: {
        Row: { id: string; name: string | null; price_monthly: number | null; video_limit: number | null; view_limit: number | null; widget_limit: number | null; features: Json };
        Insert: Partial<Database["public"]["Tables"]["plans"]["Row"]> & { id: string };
        Update: Partial<Database["public"]["Tables"]["plans"]["Insert"]>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          store_id: string;
          plan_id: string | null;
          status: string;
          current_period_start: string | null;
          current_period_end: string | null;
          provider: string | null;
          provider_customer_id: string | null;
          provider_subscription_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["subscriptions"]["Row"]> & { store_id: string };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Insert"]>;
        Relationships: [];
      };
      feed_settings: {
        Row: { id: string; store_id: string; is_active: boolean; slug: string; settings: Json; created_at: string; updated_at: string };
        Insert: Partial<Database["public"]["Tables"]["feed_settings"]["Row"]> & { store_id: string };
        Update: Partial<Database["public"]["Tables"]["feed_settings"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type TableRow<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type TableInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
export type TableUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];
