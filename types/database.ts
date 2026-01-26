export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      bookings: {
        Row: {
          base_price: number
          booking_date: string
          booking_time: string
          client_id: string
          created_at: string
          created_by: string | null
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
        }
        Insert: {
          base_price: number
          booking_date: string
          booking_time: string
          client_id: string
          created_at?: string
          created_by?: string | null
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
        }
        Update: {
          base_price?: number
          booking_date?: string
          booking_time?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
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
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string
          salon_id: string
          updated_at: string
          visit_count: number
        }
        Insert: {
          client_code: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone: string
          salon_id: string
          updated_at?: string
          visit_count?: number
        }
        Update: {
          client_code?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string
          salon_id?: string
          updated_at?: string
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
          base_salary: number
          base_threshold: number
          commission_rate: number
          created_at: string
          email: string | null
          employee_code: string
          first_name: string
          id: string
          last_name: string | null
          phone: string | null
          salon_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_salary?: number
          base_threshold?: number
          commission_rate?: number
          created_at?: string
          email?: string | null
          employee_code: string
          first_name: string
          id?: string
          last_name?: string | null
          phone?: string | null
          salon_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_salary?: number
          base_threshold?: number
          commission_rate?: number
          created_at?: string
          email?: string | null
          employee_code?: string
          first_name?: string
          id?: string
          last_name?: string | null
          phone?: string | null
          salon_id?: string
          updated_at?: string
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
      services: {
        Row: {
          active: boolean
          category: string
          description: string | null
          duration: number
          id: string
          name: string
          price: number
          salon_id: string
          subcategory: string
          surcharge_allowed: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          description?: string | null
          duration: number
          id?: string
          name: string
          price: number
          salon_id: string
          subcategory: string
          surcharge_allowed?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          description?: string | null
          duration?: number
          id?: string
          name?: string
          price?: number
          salon_id?: string
          subcategory?: string
          surcharge_allowed?: boolean
          updated_at?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_client_code: {
        Args: {
          salon_uuid: string
        }
        Returns: string
      }
      generate_employee_code: {
        Args: {
          salon_uuid: string
        }
        Returns: string
      }
      increment_client_visits: {
        Args: {
          client_uuid: string
        }
        Returns: undefined
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

export type Tables<
  PublicTableNameOrOptions extends
  | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
  | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
  ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
    Database[PublicTableNameOrOptions["schema"]]["Views"])
  : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
    Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
  ? R
  : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] &
    Database["public"]["Views"])
  ? (Database["public"]["Tables"] &
    Database["public"]["Views"])[PublicTableNameOrOptions] extends {
      Row: infer R
    }
  ? R
  : never
  : never

export type TablesInsert<
  PublicTableNameOrOptions extends
  | keyof Database["public"]["Tables"]
  | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
  ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
  : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Insert: infer I
  }
  ? I
  : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
  ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
    Insert: infer I
  }
  ? I
  : never
  : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
  | keyof Database["public"]["Tables"]
  | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
  ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
  : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Update: infer U
  }
  ? U
  : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
  ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
    Update: infer U
  }
  ? U
  : never
  : never

export type Enums<
  PublicEnumNameOrOptions extends
  | keyof Database["public"]["Enums"]
  | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
  ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
  : never = never
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
  ? Database["public"]["Enums"][PublicEnumNameOrOptions]
  : never
