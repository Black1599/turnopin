export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          company_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          company_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          company_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      billable_worker_cycles: {
        Row: {
          company_id: string
          created_at: string
          cycle_start: string
          id: string
          reported_to_stripe_at: string | null
          worker_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          cycle_start: string
          id?: string
          reported_to_stripe_at?: string | null
          worker_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          cycle_start?: string
          id?: string
          reported_to_stripe_at?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billable_worker_cycles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billable_worker_cycles_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          billing_cycle_end: string | null
          billing_cycle_start: string | null
          billing_email: string | null
          canceled_at: string | null
          ccc: string | null
          commercial_name: string | null
          country: string
          created_at: string
          current_period_end: string | null
          fiscal_address: string | null
          id: string
          is_demo: boolean
          is_pilot: boolean
          legal_name: string
          owner_id: string | null
          plan: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string
          tax_id: string | null
          trial_denied: boolean
          trial_ends_at: string
        }
        Insert: {
          billing_cycle_end?: string | null
          billing_cycle_start?: string | null
          billing_email?: string | null
          canceled_at?: string | null
          ccc?: string | null
          commercial_name?: string | null
          country?: string
          created_at?: string
          current_period_end?: string | null
          fiscal_address?: string | null
          id?: string
          is_demo?: boolean
          is_pilot?: boolean
          legal_name: string
          owner_id?: string | null
          plan?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          tax_id?: string | null
          trial_denied?: boolean
          trial_ends_at?: string
        }
        Update: {
          billing_cycle_end?: string | null
          billing_cycle_start?: string | null
          billing_email?: string | null
          canceled_at?: string | null
          ccc?: string | null
          commercial_name?: string | null
          country?: string
          created_at?: string
          current_period_end?: string | null
          fiscal_address?: string | null
          id?: string
          is_demo?: boolean
          is_pilot?: boolean
          legal_name?: string
          owner_id?: string | null
          plan?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          tax_id?: string | null
          trial_denied?: boolean
          trial_ends_at?: string
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      corrections: {
        Row: {
          company_id: string
          corrected_by_admin_id: string | null
          corrected_location_id: string | null
          corrected_timestamp: string
          created_at: string
          id: string
          internal_notes: string | null
          original_timestamp: string
          reason: string
          reason_code: string | null
          time_entry_id: string
          worker_id: string
        }
        Insert: {
          company_id: string
          corrected_by_admin_id?: string | null
          corrected_location_id?: string | null
          corrected_timestamp: string
          created_at?: string
          id?: string
          internal_notes?: string | null
          original_timestamp: string
          reason: string
          reason_code?: string | null
          time_entry_id: string
          worker_id: string
        }
        Update: {
          company_id?: string
          corrected_by_admin_id?: string | null
          corrected_location_id?: string | null
          corrected_timestamp?: string
          created_at?: string
          id?: string
          internal_notes?: string | null
          original_timestamp?: string
          reason?: string
          reason_code?: string | null
          time_entry_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "corrections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrections_corrected_location_id_fkey"
            columns: ["corrected_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrections_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrections_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries_effective"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrections_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          company_id: string
          created_at: string
          id: string
          kind: string
          location_id: string | null
          resolution_entry_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          time_entry_id: string | null
          work_date: string | null
          worker_id: string
          worker_no_recall: boolean
          worker_reported_time: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          kind?: string
          location_id?: string | null
          resolution_entry_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          time_entry_id?: string | null
          work_date?: string | null
          worker_id: string
          worker_no_recall?: boolean
          worker_reported_time?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          location_id?: string | null
          resolution_entry_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          time_entry_id?: string | null
          work_date?: string | null
          worker_id?: string
          worker_no_recall?: boolean
          worker_reported_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_resolution_entry_id_fkey"
            columns: ["resolution_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_resolution_entry_id_fkey"
            columns: ["resolution_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries_effective"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries_effective"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      kiosks: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          location_id: string
          revoked_at: string | null
          token: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          location_id: string
          revoked_at?: string | null
          token?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          location_id?: string
          revoked_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "kiosks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kiosks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string
          archived_at: string | null
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          address?: string
          archived_at?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          address?: string
          archived_at?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempts: number
          company_id: string
          created_at: string
          dedupe_key: string | null
          id: string
          kind: string
          last_error: string | null
          payload: Json
          recipient: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          company_id: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind: string
          last_error?: string | null
          payload?: Json
          recipient?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          company_id?: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          payload?: Json
          recipient?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pin_attempts: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          success: boolean
          worker_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          success?: boolean
          worker_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          success?: boolean
          worker_id?: string | null
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          payload: Json
          processed_at: string | null
          type: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id: string
          payload: Json
          processed_at?: string | null
          type: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          company_id: string
          corrected: boolean
          created_at: string
          created_by: string | null
          id: string
          incident_id: string | null
          internal_notes: string | null
          is_manual: boolean
          local_time: string
          location_id: string | null
          manual_reason: string | null
          original_local_time: string | null
          original_server_timestamp: string | null
          original_work_date: string | null
          server_timestamp: string
          source: string | null
          type: string
          work_date: string
          worker_id: string
        }
        Insert: {
          company_id: string
          corrected?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          incident_id?: string | null
          internal_notes?: string | null
          is_manual?: boolean
          local_time: string
          location_id?: string | null
          manual_reason?: string | null
          original_local_time?: string | null
          original_server_timestamp?: string | null
          original_work_date?: string | null
          server_timestamp?: string
          source?: string | null
          type: string
          work_date: string
          worker_id: string
        }
        Update: {
          company_id?: string
          corrected?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          incident_id?: string | null
          internal_notes?: string | null
          is_manual?: boolean
          local_time?: string
          location_id?: string | null
          manual_reason?: string | null
          original_local_time?: string | null
          original_server_timestamp?: string | null
          original_work_date?: string | null
          server_timestamp?: string
          source?: string | null
          type?: string
          work_date?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_usage: {
        Row: {
          billable: boolean | null
          company_id: string | null
          created_at: string
          delivery_status: string | null
          direction: string
          error: string | null
          id: string
          kind: string
          pricing_category: string | null
          pricing_model: string | null
          updated_at: string
          wa_message_id: string | null
          worker_id: string | null
        }
        Insert: {
          billable?: boolean | null
          company_id?: string | null
          created_at?: string
          delivery_status?: string | null
          direction: string
          error?: string | null
          id?: string
          kind: string
          pricing_category?: string | null
          pricing_model?: string | null
          updated_at?: string
          wa_message_id?: string | null
          worker_id?: string | null
        }
        Update: {
          billable?: boolean | null
          company_id?: string | null
          created_at?: string
          delivery_status?: string | null
          direction?: string
          error?: string | null
          id?: string
          kind?: string
          pricing_category?: string | null
          pricing_model?: string | null
          updated_at?: string
          wa_message_id?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_usage_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_usage_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_webhook_events: {
        Row: {
          dedupe_key: string
          id: string
          kind: string
          payload: Json
          processed_at: string | null
          processing_error: string | null
          received_at: string
        }
        Insert: {
          dedupe_key: string
          id?: string
          kind: string
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Update: {
          dedupe_key?: string
          id?: string
          kind?: string
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Relationships: []
      }
      worker_locations: {
        Row: {
          company_id: string
          created_at: string
          location_id: string
          worker_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          location_id: string
          worker_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          location_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_locations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          access_token: string
          archived_at: string | null
          break_paid: boolean
          break_tracking: boolean
          company_id: string
          created_at: string
          dni_nie: string | null
          ended_at: string | null
          first_name: string
          has_pin: boolean | null
          hired_at: string | null
          id: string
          last_name: string
          naf: string | null
          phone: string | null
          pin_hash: string | null
          second_last_name: string | null
          status: string
          whatsapp_enabled: boolean
          whatsapp_link_code_expires_at: string | null
          whatsapp_link_code_hash: string | null
          whatsapp_link_status: string
          whatsapp_linked_at: string | null
          whatsapp_phone_linked: string | null
        }
        Insert: {
          access_token?: string
          archived_at?: string | null
          break_paid?: boolean
          break_tracking?: boolean
          company_id: string
          created_at?: string
          dni_nie?: string | null
          ended_at?: string | null
          first_name: string
          has_pin?: boolean | null
          hired_at?: string | null
          id?: string
          last_name: string
          naf?: string | null
          phone?: string | null
          pin_hash?: string | null
          second_last_name?: string | null
          status?: string
          whatsapp_enabled?: boolean
          whatsapp_link_code_expires_at?: string | null
          whatsapp_link_code_hash?: string | null
          whatsapp_link_status?: string
          whatsapp_linked_at?: string | null
          whatsapp_phone_linked?: string | null
        }
        Update: {
          access_token?: string
          archived_at?: string | null
          break_paid?: boolean
          break_tracking?: boolean
          company_id?: string
          created_at?: string
          dni_nie?: string | null
          ended_at?: string | null
          first_name?: string
          has_pin?: boolean | null
          hired_at?: string | null
          id?: string
          last_name?: string
          naf?: string | null
          phone?: string | null
          pin_hash?: string | null
          second_last_name?: string | null
          status?: string
          whatsapp_enabled?: boolean
          whatsapp_link_code_expires_at?: string | null
          whatsapp_link_code_hash?: string | null
          whatsapp_link_status?: string
          whatsapp_linked_at?: string | null
          whatsapp_phone_linked?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      time_entries_effective: {
        Row: {
          company_id: string | null
          corrected_at: string | null
          corrected_by: string | null
          correction_reason: string | null
          correction_reason_code: string | null
          created_at: string | null
          created_by: string | null
          effective_local_time: string | null
          effective_location_id: string | null
          effective_timestamp: string | null
          effective_work_date: string | null
          id: string | null
          incident_id: string | null
          is_corrected: boolean | null
          is_manual: boolean | null
          manual_reason: string | null
          original_local_time: string | null
          original_location_id: string | null
          original_timestamp: string | null
          original_work_date: string | null
          type: string | null
          worker_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_location_id_fkey"
            columns: ["original_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_add_manual_entry: {
        Args: {
          p_incident_id?: string
          p_location_id: string
          p_reason: string
          p_reason_code?: string
          p_timestamp: string
          p_type: string
          p_worker_id: string
        }
        Returns: string
      }
      admin_add_manual_shift: {
        Args: {
          p_end: string
          p_location_id: string
          p_reason: string
          p_reason_code?: string
          p_start: string
          p_worker_id: string
        }
        Returns: Json
      }
      admin_correct_entry:
        | {
            Args: {
              p_corrected_timestamp: string
              p_entry_id: string
              p_internal_notes?: string
              p_reason: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_corrected_timestamp: string
              p_entry_id: string
              p_internal_notes?: string
              p_location_id?: string
              p_reason: string
              p_reason_code?: string
            }
            Returns: Json
          }
      admin_resolve_incident: {
        Args: { p_incident_id: string; p_notes?: string }
        Returns: Json
      }
      admin_resolve_incident_v2: {
        Args: {
          p_exit_timestamp: string
          p_incident_id: string
          p_reason: string
          p_reason_code?: string
        }
        Returns: Json
      }
      admin_rotate_kiosk: { Args: { p_location_id: string }; Returns: string }
      admin_rotate_worker_access: {
        Args: { p_worker_id: string }
        Returns: string
      }
      admin_set_worker_pin: {
        Args: { p_pin: string; p_worker_id: string }
        Returns: undefined
      }
      admin_whatsapp_link_code: {
        Args: { p_worker_id: string }
        Returns: string
      }
      admin_whatsapp_unlink: {
        Args: { p_worker_id: string }
        Returns: undefined
      }
      company_writable: { Args: { _company_id: string }; Returns: boolean }
      enqueue_weekly_summaries: { Args: never; Returns: number }
      is_company_member: { Args: { _company_id: string }; Returns: boolean }
      kiosk_action: {
        Args: {
          p_action?: string
          p_new_pin?: string
          p_no_recall?: boolean
          p_pin: string
          p_reported_time?: string
          p_token: string
          p_worker_id: string
        }
        Returns: Json
      }
      kiosk_check_pin: {
        Args: {
          p_pin: string
          p_worker: Database["public"]["Tables"]["workers"]["Row"]
        }
        Returns: string
      }
      kiosk_company: { Args: { p_company_id: string }; Returns: Json }
      kiosk_info: { Args: { p_token: string }; Returns: Json }
      kiosk_list_workers: {
        Args: { p_token: string }
        Returns: {
          first_name: string
          id: string
          last_name: string
        }[]
      }
      kiosk_punch:
        | {
            Args: {
              p_action?: string
              p_company_id: string
              p_pin: string
              p_worker_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_action?: string
              p_company_id: string
              p_no_recall?: boolean
              p_pin: string
              p_reported_time?: string
              p_worker_id: string
            }
            Returns: Json
          }
      kiosk_workers: {
        Args: { p_company_id: string }
        Returns: {
          first_name: string
          id: string
          last_name: string
        }[]
      }
      madrid_now: { Args: never; Returns: string }
      normalize_tax_id: { Args: { _t: string }; Returns: string }
      punch_core: {
        Args: {
          p_action: string
          p_location_id: string
          p_no_recall: boolean
          p_reported_time: string
          p_source: string
          p_worker: Database["public"]["Tables"]["workers"]["Row"]
        }
        Returns: Json
      }
      record_billable_workers: {
        Args: { _company_id: string }
        Returns: number
      }
      whatsapp_action: {
        Args: {
          p_action: string
          p_location_id?: string
          p_no_recall?: boolean
          p_phone: string
          p_reported_time?: string
        }
        Returns: Json
      }
      whatsapp_link: {
        Args: { p_phone: string; p_secret: string }
        Returns: Json
      }
      worker_month_records: {
        Args: {
          p_company_id: string
          p_month: string
          p_pin: string
          p_worker_id: string
        }
        Returns: Json
      }
      worker_open_event: {
        Args: { _worker_id: string }
        Returns: {
          effective_local_time: string
          effective_timestamp: string
          effective_work_date: string
          id: string
          location_id: string
          type: string
        }[]
      }
      worker_portal: {
        Args: { p_access_token: string; p_month?: string; p_pin: string }
        Returns: Json
      }
      worker_portal_change_pin: {
        Args: { p_access_token: string; p_new_pin: string; p_pin: string }
        Returns: Json
      }
      worker_state: { Args: { _worker_id: string }; Returns: string }
      worker_status: { Args: { _worker_id: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
