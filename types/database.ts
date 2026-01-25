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
      salons: {
        Row: {
          id: string
          slug: string
          name: string
          owner_email: string
          settings: Json | null
          subscription_plan: string
          subscription_status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          owner_email: string
          settings?: Json | null
          subscription_plan?: string
          subscription_status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          owner_email?: string
          settings?: Json | null
          subscription_plan?: string
          subscription_status?: string
          created_at?: string
          updated_at?: string
        }
      }
      profiles: {
        Row: {
          id: string
          user_id: string
          salon_id: string
          full_name: string
          role: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          salon_id: string
          full_name: string
          role?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          salon_id?: string
          full_name?: string
          role?: string
          created_at?: string
          updated_at?: string
        }
      }
      employees: {
        Row: {
          id: string
          salon_id: string
          employee_code: string
          first_name: string
          last_name: string | null
          email: string | null
          phone: string | null
          base_threshold: number
          base_salary: number
          commission_rate: number
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          employee_code: string
          first_name: string
          last_name?: string | null
          email?: string | null
          phone?: string | null
          base_threshold?: number
          base_salary?: number
          commission_rate?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          employee_code?: string
          first_name?: string
          last_name?: string | null
          email?: string | null
          phone?: string | null
          base_threshold?: number
          base_salary?: number
          commission_rate?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      clients: {
        Row: {
          id: string
          salon_id: string
          client_code: string
          full_name: string
          phone: string
          email: string | null
          notes: string | null
          visit_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          client_code: string
          full_name: string
          phone: string
          email?: string | null
          notes?: string | null
          visit_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          client_code?: string
          full_name?: string
          phone?: string
          email?: string | null
          notes?: string | null
          visit_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      services: {
        Row: {
          id: string
          salon_id: string
          category: string
          subcategory: string
          name: string
          price: number
          duration: number
          surcharge_allowed: boolean
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          category: string
          subcategory: string
          name: string
          price: number
          duration: number
          surcharge_allowed?: boolean
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          category?: string
          subcategory?: string
          name?: string
          price?: number
          duration?: number
          surcharge_allowed?: boolean
          active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      bookings: {
        Row: {
          id: string
          salon_id: string
          employee_id: string
          client_id: string
          service_id: string
          booking_date: string
          booking_time: string
          duration: number
          status: string
          payment_method: string | null
          base_price: number
          surcharge: number
          total_price: number
          notes: string | null
          source: string
          created_by: string | null
          updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          employee_id: string
          client_id: string
          service_id: string
          booking_date: string
          booking_time: string
          duration: number
          status?: string
          payment_method?: string | null
          base_price: number
          surcharge?: number
          notes?: string | null
          source?: string
          created_by?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          employee_id?: string
          client_id?: string
          service_id?: string
          booking_date?: string
          booking_time?: string
          duration?: number
          status?: string
          payment_method?: string | null
          base_price?: number
          surcharge?: number
          notes?: string | null
          source?: string
          created_by?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      payroll_runs: {
        Row: {
          id: string
          salon_id: string
          period_start: string
          period_end: string
          period_month: string
          total_revenue: number
          total_payroll: number
          status: string
          generated_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          salon_id: string
          period_start: string
          period_end: string
          period_month: string
          total_revenue: number
          total_payroll: number
          status?: string
          generated_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          salon_id?: string
          period_start?: string
          period_end?: string
          period_month?: string
          total_revenue?: number
          total_payroll?: number
          status?: string
          generated_by?: string
          created_at?: string
          updated_at?: string
        }
      }
      payroll_entries: {
        Row: {
          id: string
          payroll_run_id: string
          employee_id: string
          visit_count: number
          total_revenue: number
          base_threshold: number
          base_salary: number
          commission_rate: number
          commission_amount: number
          total_payout: number
          pdf_url: string | null
          email_sent_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          payroll_run_id: string
          employee_id: string
          visit_count: number
          total_revenue: number
          base_threshold: number
          base_salary: number
          commission_rate: number
          commission_amount: number
          total_payout: number
          pdf_url?: string | null
          email_sent_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          payroll_run_id?: string
          employee_id?: string
          visit_count?: number
          total_revenue?: number
          base_threshold?: number
          base_salary?: number
          commission_rate?: number
          commission_amount?: number
          total_payout?: number
          pdf_url?: string | null
          email_sent_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_employee_code: {
        Args: {
          salon_uuid: string
        }
        Returns: string
      }
      generate_client_code: {
        Args: {
          salon_uuid: string
        }
        Returns: string
      }
      increment_client_visits: {
        Args: {
          client_uuid: string
        }
        Returns: void
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}