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
      companies: {
        Row: {
          ccc: string | null
          created_at: string
          id: string
          is_demo: boolean
          legal_name: string
          owner_id: string | null
          plan: string
          subscription_status: string
          tax_id: string | null
          trial_ends_at: string
        }
        Insert: {
          ccc?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          legal_name: string
          owner_id?: string | null
          plan?: string
          subscription_status?: string
          tax_id?: string | null
          trial_ends_at?: string
        }
        Update: {
          ccc?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          legal_name?: string
          owner_id?: string | null
          plan?: string
          subscription_status?: string
          tax_id?: string | null
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
          corrected_timestamp: string
          created_at: string
          id: string
          internal_notes: string | null
          original_timestamp: string
          reason: string
          time_entry_id: string
          worker_id: string
        }
        Insert: {
          company_id: string
          corrected_by_admin_id?: string | null
          corrected_timestamp: string
          created_at?: string
          id?: string
          internal_notes?: string | null
          original_timestamp: string
          reason: string
          time_entry_id: string
          worker_id: string
        }
        Update: {
          company_id?: string
          corrected_by_admin_id?: string | null
          corrected_timestamp?: string
          created_at?: string
          id?: string
          internal_notes?: string | null
          original_timestamp?: string
          reason?: string
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
            foreignKeyName: "corrections_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
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
      time_entries: {
        Row: {
          company_id: string
          corrected: boolean
          created_at: string
          id: string
          internal_notes: string | null
          local_time: string
          original_local_time: string | null
          original_server_timestamp: string | null
          original_work_date: string | null
          server_timestamp: string
          type: string
          work_date: string
          worker_id: string
        }
        Insert: {
          company_id: string
          corrected?: boolean
          created_at?: string
          id?: string
          internal_notes?: string | null
          local_time: string
          original_local_time?: string | null
          original_server_timestamp?: string | null
          original_work_date?: string | null
          server_timestamp?: string
          type: string
          work_date: string
          worker_id: string
        }
        Update: {
          company_id?: string
          corrected?: boolean
          created_at?: string
          id?: string
          internal_notes?: string | null
          local_time?: string
          original_local_time?: string | null
          original_server_timestamp?: string | null
          original_work_date?: string | null
          server_timestamp?: string
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
            foreignKeyName: "time_entries_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          archived_at: string | null
          company_id: string
          created_at: string
          dni_nie: string | null
          first_name: string
          hired_at: string | null
          id: string
          last_name: string
          naf: string | null
          pin_hash: string | null
          second_last_name: string | null
          status: string
        }
        Insert: {
          archived_at?: string | null
          company_id: string
          created_at?: string
          dni_nie?: string | null
          first_name: string
          hired_at?: string | null
          id?: string
          last_name: string
          naf?: string | null
          pin_hash?: string | null
          second_last_name?: string | null
          status?: string
        }
        Update: {
          archived_at?: string | null
          company_id?: string
          created_at?: string
          dni_nie?: string | null
          first_name?: string
          hired_at?: string | null
          id?: string
          last_name?: string
          naf?: string | null
          pin_hash?: string | null
          second_last_name?: string | null
          status?: string
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
      [_ in never]: never
    }
    Functions: {
      admin_correct_entry: {
        Args: {
          p_corrected_timestamp: string
          p_entry_id: string
          p_internal_notes?: string
          p_reason: string
        }
        Returns: Json
      }
      admin_set_worker_pin: {
        Args: { p_pin: string; p_worker_id: string }
        Returns: undefined
      }
      is_company_member: { Args: { _company_id: string }; Returns: boolean }
      kiosk_company: { Args: { p_company_id: string }; Returns: Json }
      kiosk_punch: {
        Args: {
          p_action?: string
          p_company_id: string
          p_pin: string
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
