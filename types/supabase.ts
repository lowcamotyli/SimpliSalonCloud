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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          operation: string
          record_id: string
          salon_id: string
          table_name: string
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          operation: string
          record_id: string
          salon_id: string
          table_name: string
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          operation?: string
          record_id?: string
          salon_id?: string
          table_name?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          base_price: number
          booking_date: string
          booking_time: string
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          duration: number
          employee_id: string
          id: string
          notes: string | null
          payment_method: string | null
          salon_id: string
          service_id: string
          source: string
          status: string
          surcharge: number
          total_price: number | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          base_price: number
          booking_date: string
          booking_time: string
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          duration: number
          employee_id: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          salon_id: string
          service_id: string
          source?: string
          status?: string
          surcharge?: number
          total_price?: number | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          base_price?: number
          booking_date?: string
          booking_time?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          duration?: number
          employee_id?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          salon_id?: string
          service_id?: string
          source?: string
          status?: string
          surcharge?: number
          total_price?: number | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          client_code: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string
          salon_id: string
          updated_at: string
          version: number
          visit_count: number
        }
        Insert: {
          client_code: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone: string
          salon_id: string
          updated_at?: string
          version?: number
          visit_count?: number
        }
        Update: {
          client_code?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string
          salon_id?: string
          updated_at?: string
          version?: number
          visit_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "clients_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          avatar_url: string | null
          base_salary: number
          base_threshold: number
          commission_rate: number
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          employee_code: string
          first_name: string
          id: string
          last_name: string | null
          phone: string | null
          salon_id: string
          updated_at: string
          user_id: string | null
          version: number
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          base_salary?: number
          base_threshold?: number
          commission_rate?: number
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          employee_code: string
          first_name: string
          id?: string
          last_name?: string | null
          phone?: string | null
          salon_id: string
          updated_at?: string
          user_id?: string | null
          version?: number
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          base_salary?: number
          base_threshold?: number
          commission_rate?: number
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          employee_code?: string
          first_name?: string
          id?: string
          last_name?: string | null
          phone?: string | null
          salon_id?: string
          updated_at?: string
          user_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "employees_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_configs: {
        Row: {
          created_at: string | null
          credentials: Json | null
          id: string
          integration_type: string
          is_active: boolean | null
          last_sync_at: string | null
          salon_id: string
          settings: Json | null
          sync_status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          credentials?: Json | null
          id?: string
          integration_type: string
          is_active?: boolean | null
          last_sync_at?: string | null
          salon_id: string
          settings?: Json | null
          sync_status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          credentials?: Json | null
          id?: string
          integration_type?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          salon_id?: string
          settings?: Json | null
          sync_status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_configs_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_entries: {
        Row: {
          base_salary: number
          base_threshold: number
          commission_amount: number
          commission_rate: number
          created_at: string
          email_sent_at: string | null
          employee_id: string
          id: string
          payroll_run_id: string
          pdf_url: string | null
          total_payout: number | null
          total_revenue: number
          updated_at: string
          visit_count: number
        }
        Insert: {
          base_salary: number
          base_threshold: number
          commission_amount: number
          commission_rate: number
          created_at?: string
          email_sent_at?: string | null
          employee_id: string
          id?: string
          payroll_run_id: string
          pdf_url?: string | null
          total_payout?: number | null
          total_revenue: number
          updated_at?: string
          visit_count: number
        }
        Update: {
          base_salary?: number
          base_threshold?: number
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          email_sent_at?: string | null
          employee_id?: string
          id?: string
          payroll_run_id?: string
          pdf_url?: string | null
          total_payout?: number | null
          total_revenue?: number
          updated_at?: string
          visit_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          generated_by: string
          id: string
          period_end: string
          period_month: string
          period_start: string
          salon_id: string
          status: string
          total_payroll: number
          total_revenue: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          generated_by: string
          id?: string
          period_end: string
          period_month: string
          period_start: string
          salon_id: string
          status?: string
          total_payroll: number
          total_revenue: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          generated_by?: string
          id?: string
          period_end?: string
          period_month?: string
          period_start?: string
          salon_id?: string
          status?: string
          total_payroll?: number
          total_revenue?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          role: string
          salon_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          role?: string
          salon_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          role?: string
          salon_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      salon_integrations: {
        Row: {
          access_token: string | null
          created_at: string | null
          gmail_email: string | null
          id: string
          integration_type: string
          is_active: boolean | null
          last_sync_at: string | null
          refresh_token: string | null
          salon_id: string
          sync_error: string | null
          sync_status: string | null
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          created_at?: string | null
          gmail_email?: string | null
          id?: string
          integration_type: string
          is_active?: boolean | null
          last_sync_at?: string | null
          refresh_token?: string | null
          salon_id: string
          sync_error?: string | null
          sync_status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          created_at?: string | null
          gmail_email?: string | null
          id?: string
          integration_type?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          refresh_token?: string | null
          salon_id?: string
          sync_error?: string | null
          sync_status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salon_integrations_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      salon_settings: {
        Row: {
          accounting_email: string | null
          address: Json | null
          allow_waitlist: boolean | null
          booking_window_days: number | null
          booksy_enabled: boolean | null
          booksy_gmail_email: string | null
          booksy_gmail_tokens: Json | null
          business_type: string | null
          closures: Json | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string | null
          currency: string | null
          custom_colors: Json | null
          deposit_amount: number | null
          description: string | null
          font_family: string | null
          id: string
          language: string | null
          logo_url: string | null
          min_notice_hours: number | null
          notification_settings: Json | null
          operating_hours: Json
          require_deposit: boolean | null
          salon_id: string
          slot_duration_minutes: number | null
          theme: string | null
          timezone: string | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          accounting_email?: string | null
          address?: Json | null
          allow_waitlist?: boolean | null
          booking_window_days?: number | null
          booksy_enabled?: boolean | null
          booksy_gmail_email?: string | null
          booksy_gmail_tokens?: Json | null
          business_type?: string | null
          closures?: Json | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          currency?: string | null
          custom_colors?: Json | null
          deposit_amount?: number | null
          description?: string | null
          font_family?: string | null
          id?: string
          language?: string | null
          logo_url?: string | null
          min_notice_hours?: number | null
          notification_settings?: Json | null
          operating_hours?: Json
          require_deposit?: boolean | null
          salon_id: string
          slot_duration_minutes?: number | null
          theme?: string | null
          timezone?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          accounting_email?: string | null
          address?: Json | null
          allow_waitlist?: boolean | null
          booking_window_days?: number | null
          booksy_enabled?: boolean | null
          booksy_gmail_email?: string | null
          booksy_gmail_tokens?: Json | null
          business_type?: string | null
          closures?: Json | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          currency?: string | null
          custom_colors?: Json | null
          deposit_amount?: number | null
          description?: string | null
          font_family?: string | null
          id?: string
          language?: string | null
          logo_url?: string | null
          min_notice_hours?: number | null
          notification_settings?: Json | null
          operating_hours?: Json
          require_deposit?: boolean | null
          salon_id?: string
          slot_duration_minutes?: number | null
          theme?: string | null
          timezone?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salon_settings_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: true
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      salons: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          name: string
          owner_email: string
          settings: Json | null
          slug: string
          subscription_plan: string
          subscription_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          name: string
          owner_email: string
          settings?: Json | null
          slug: string
          subscription_plan?: string
          subscription_status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          name?: string
          owner_email?: string
          settings?: Json | null
          slug?: string
          subscription_plan?: string
          subscription_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          active: boolean
          category: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          duration: number
          id: string
          name: string
          price: number
          salon_id: string
          subcategory: string
          surcharge_allowed: boolean
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          duration: number
          id?: string
          name: string
          price: number
          salon_id: string
          subcategory: string
          surcharge_allowed?: boolean
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          duration?: number
          id?: string
          name?: string
          price?: number
          salon_id?: string
          subcategory?: string
          surcharge_allowed?: boolean
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "services_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_client_code: { Args: { salon_uuid: string }; Returns: string }
      generate_employee_code: { Args: { salon_uuid: string }; Returns: string }
      get_user_employee_id: { Args: never; Returns: string }
      get_user_salon_id: { Args: never; Returns: string }
      has_any_salon_role: {
        Args: { required_roles: string[] }
        Returns: boolean
      }
      has_salon_role: { Args: { required_role: string }; Returns: boolean }
      increment_client_visits: {
        Args: { client_uuid: string }
        Returns: undefined
      }
      link_employee_to_user_by_email: {
        Args: { employee_uuid: string; user_email: string }
        Returns: {
          employee_id: string
          user_id: string
        }[]
      }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
