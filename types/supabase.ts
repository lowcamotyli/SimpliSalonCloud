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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
      beauty_plan_steps: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          is_completed: boolean
          notes: string | null
          plan_id: string
          planned_date: string | null
          service_id: string | null
          step_order: number
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          notes?: string | null
          plan_id: string
          planned_date?: string | null
          service_id?: string | null
          step_order: number
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          notes?: string | null
          plan_id?: string
          planned_date?: string | null
          service_id?: string | null
          step_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "beauty_plan_steps_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beauty_plan_steps_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "beauty_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beauty_plan_steps_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      beauty_plans: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "beauty_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beauty_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      blacklist_settings: {
        Row: {
          created_at: string
          id: string
          late_cancel_threshold: number
          no_show_threshold: number
          salon_id: string
          updated_at: string
          window_months: number
        }
        Insert: {
          created_at?: string
          id?: string
          late_cancel_threshold?: number
          no_show_threshold?: number
          salon_id: string
          updated_at?: string
          window_months?: number
        }
        Update: {
          created_at?: string
          id?: string
          late_cancel_threshold?: number
          no_show_threshold?: number
          salon_id?: string
          updated_at?: string
          window_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "blacklist_settings_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: true
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
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
          reminder_sent: boolean
          salon_id: string
          service_id: string
          source: string
          status: string
          surcharge: number
          survey_sent: boolean
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
          reminder_sent?: boolean
          salon_id: string
          service_id: string
          source?: string
          status?: string
          surcharge?: number
          survey_sent?: boolean
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
          reminder_sent?: boolean
          salon_id?: string
          service_id?: string
          source?: string
          status?: string
          surcharge?: number
          survey_sent?: boolean
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
      booksy_pending_emails: {
        Row: {
          body_snippet: string | null
          created_at: string
          failure_detail: string | null
          failure_reason: string
          id: string
          message_id: string
          parsed_data: Json | null
          resolved_at: string | null
          salon_id: string
          status: string
          subject: string | null
        }
        Insert: {
          body_snippet?: string | null
          created_at?: string
          failure_detail?: string | null
          failure_reason?: string
          id?: string
          message_id: string
          parsed_data?: Json | null
          resolved_at?: string | null
          salon_id: string
          status?: string
          subject?: string | null
        }
        Update: {
          body_snippet?: string | null
          created_at?: string
          failure_detail?: string | null
          failure_reason?: string
          id?: string
          message_id?: string
          parsed_data?: Json | null
          resolved_at?: string | null
          salon_id?: string
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booksy_pending_emails_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      booksy_sync_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          emails_error: number
          emails_found: number
          emails_success: number
          error_message: string | null
          finished_at: string | null
          id: string
          salon_id: string
          started_at: string
          sync_results: Json | null
          triggered_by: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          emails_error?: number
          emails_found?: number
          emails_success?: number
          error_message?: string | null
          finished_at?: string | null
          id?: string
          salon_id: string
          started_at?: string
          sync_results?: Json | null
          triggered_by: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          emails_error?: number
          emails_found?: number
          emails_success?: number
          error_message?: string | null
          finished_at?: string | null
          id?: string
          salon_id?: string
          started_at?: string
          sync_results?: Json | null
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "booksy_sync_logs_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      client_forms: {
        Row: {
          answers: string
          answers_iv: string
          answers_tag: string
          booking_id: string | null
          client_id: string
          created_at: string
          fill_token: string | null
          fill_token_exp: string | null
          form_template_id: string
          id: string
          signature_url: string | null
          signed_at: string | null
          submitted_at: string | null
        }
        Insert: {
          answers: string
          answers_iv: string
          answers_tag: string
          booking_id?: string | null
          client_id: string
          created_at?: string
          fill_token?: string | null
          fill_token_exp?: string | null
          form_template_id: string
          id?: string
          signature_url?: string | null
          signed_at?: string | null
          submitted_at?: string | null
        }
        Update: {
          answers?: string
          answers_iv?: string
          answers_tag?: string
          booking_id?: string | null
          client_id?: string
          created_at?: string
          fill_token?: string | null
          fill_token_exp?: string | null
          form_template_id?: string
          id?: string
          signature_url?: string | null
          signed_at?: string | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_forms_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_forms_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_forms_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      client_violations: {
        Row: {
          booking_id: string | null
          client_id: string
          created_at: string
          id: string
          occurred_at: string
          violation_type: string
        }
        Insert: {
          booking_id?: string | null
          client_id: string
          created_at?: string
          id?: string
          occurred_at?: string
          violation_type: string
        }
        Update: {
          booking_id?: string | null
          client_id?: string
          created_at?: string
          id?: string
          occurred_at?: string
          violation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_violations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_violations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          birthday: string | null
          blacklist_reason: string | null
          blacklist_status: string
          blacklisted_at: string | null
          client_code: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          email_opt_in: boolean | null
          full_name: string
          id: string
          last_visit_at: string | null
          no_show_count: number
          notes: string | null
          phone: string
          salon_id: string
          sms_opt_in: boolean | null
          tags: string[] | null
          total_spent: number | null
          updated_at: string
          version: number
          visit_count: number
        }
        Insert: {
          birthday?: string | null
          blacklist_reason?: string | null
          blacklist_status?: string
          blacklisted_at?: string | null
          client_code: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          email_opt_in?: boolean | null
          full_name: string
          id?: string
          last_visit_at?: string | null
          no_show_count?: number
          notes?: string | null
          phone: string
          salon_id: string
          sms_opt_in?: boolean | null
          tags?: string[] | null
          total_spent?: number | null
          updated_at?: string
          version?: number
          visit_count?: number
        }
        Update: {
          birthday?: string | null
          blacklist_reason?: string | null
          blacklist_status?: string
          blacklisted_at?: string | null
          client_code?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          email_opt_in?: boolean | null
          full_name?: string
          id?: string
          last_visit_at?: string | null
          no_show_count?: number
          notes?: string | null
          phone?: string
          salon_id?: string
          sms_opt_in?: boolean | null
          tags?: string[] | null
          total_spent?: number | null
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
      crm_automations: {
        Row: {
          channel: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          last_run_at: string | null
          name: string
          salon_id: string
          template_id: string | null
          trigger_config: Json
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          channel: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          name: string
          salon_id: string
          template_id?: string | null
          trigger_config?: Json
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          channel?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          name?: string
          salon_id?: string
          template_id?: string | null
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_automations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_automations_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_automations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_campaigns: {
        Row: {
          automation_id: string | null
          channel: string
          created_at: string | null
          created_by: string | null
          failed_count: number | null
          id: string
          name: string
          qstash_message_id: string | null
          recipient_count: number | null
          salon_id: string
          scheduled_at: string | null
          segment_filters: Json
          sent_at: string | null
          sent_count: number | null
          status: string
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          automation_id?: string | null
          channel: string
          created_at?: string | null
          created_by?: string | null
          failed_count?: number | null
          id?: string
          name: string
          qstash_message_id?: string | null
          recipient_count?: number | null
          salon_id: string
          scheduled_at?: string | null
          segment_filters?: Json
          sent_at?: string | null
          sent_count?: number | null
          status?: string
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          automation_id?: string | null
          channel?: string
          created_at?: string | null
          created_by?: string | null
          failed_count?: number | null
          id?: string
          name?: string
          qstash_message_id?: string | null
          recipient_count?: number | null
          salon_id?: string
          scheduled_at?: string | null
          segment_filters?: Json
          sent_at?: string | null
          sent_count?: number | null
          status?: string
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_campaigns_salon_automation_id_fkey"
            columns: ["salon_id", "automation_id"]
            isOneToOne: false
            referencedRelation: "crm_automations"
            referencedColumns: ["salon_id", "id"]
          },
          {
            foreignKeyName: "crm_campaigns_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_completed_booking_applications: {
        Row: {
          applied_at: string
          booking_id: string
          client_id: string
          salon_id: string
        }
        Insert: {
          applied_at?: string
          booking_id: string
          client_id: string
          salon_id: string
        }
        Update: {
          applied_at?: string
          booking_id?: string
          client_id?: string
          salon_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_completed_booking_applications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_completed_booking_applications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_completed_booking_applications_salon_id_fkey"
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
      equipment: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          salon_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          salon_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          salon_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_bookings: {
        Row: {
          booking_id: string
          ends_at: string
          equipment_id: string
          id: string
          starts_at: string
        }
        Insert: {
          booking_id: string
          ends_at: string
          equipment_id: string
          id?: string
          starts_at: string
        }
        Update: {
          booking_id?: string
          ends_at?: string
          equipment_id?: string
          id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_bookings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_bookings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string | null
          enabled: boolean | null
          expires_at: string | null
          feature_name: string
          id: string
          limit_value: number | null
          salon_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean | null
          expires_at?: string | null
          feature_name: string
          id?: string
          limit_value?: number | null
          salon_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          enabled?: boolean | null
          expires_at?: string | null
          feature_name?: string
          id?: string
          limit_value?: number | null
          salon_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          created_at: string
          description: string | null
          fields: Json
          gdpr_consent_text: string | null
          id: string
          is_active: boolean
          name: string
          requires_signature: boolean
          salon_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          fields?: Json
          gdpr_consent_text?: string | null
          id?: string
          is_active?: boolean
          name: string
          requires_signature?: boolean
          salon_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          fields?: Json
          gdpr_consent_text?: string | null
          id?: string
          is_active?: boolean
          name?: string
          requires_signature?: boolean
          salon_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_templates_salon_id_fkey"
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
      invoices: {
        Row: {
          billing_address: Json | null
          billing_email: string
          billing_name: string
          created_at: string | null
          currency: string
          due_date: string | null
          id: string
          invoice_number: string
          line_items: Json
          p24_order_id: string | null
          p24_transaction_id: string | null
          paid_at: string | null
          payment_method: string | null
          pdf_url: string | null
          salon_id: string
          status: string
          subscription_id: string | null
          subtotal_cents: number
          tax_cents: number | null
          total_cents: number
          updated_at: string | null
        }
        Insert: {
          billing_address?: Json | null
          billing_email: string
          billing_name: string
          created_at?: string | null
          currency?: string
          due_date?: string | null
          id?: string
          invoice_number: string
          line_items?: Json
          p24_order_id?: string | null
          p24_transaction_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          pdf_url?: string | null
          salon_id: string
          status?: string
          subscription_id?: string | null
          subtotal_cents: number
          tax_cents?: number | null
          total_cents: number
          updated_at?: string | null
        }
        Update: {
          billing_address?: Json | null
          billing_email?: string
          billing_name?: string
          created_at?: string | null
          currency?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          line_items?: Json
          p24_order_id?: string | null
          p24_transaction_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          pdf_url?: string | null
          salon_id?: string
          status?: string
          subscription_id?: string | null
          subtotal_cents?: number
          tax_cents?: number | null
          total_cents?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      message_logs: {
        Row: {
          automation_id: string | null
          body: string
          campaign_id: string | null
          channel: string
          client_id: string
          created_at: string | null
          error: string | null
          id: string
          provider_id: string | null
          recipient: string
          salon_id: string
          sent_at: string | null
          status: string
          subject: string | null
        }
        Insert: {
          automation_id?: string | null
          body: string
          campaign_id?: string | null
          channel: string
          client_id: string
          created_at?: string | null
          error?: string | null
          id?: string
          provider_id?: string | null
          recipient: string
          salon_id: string
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          automation_id?: string | null
          body?: string
          campaign_id?: string | null
          channel?: string
          client_id?: string
          created_at?: string | null
          error?: string | null
          id?: string
          provider_id?: string | null
          recipient?: string
          salon_id?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "crm_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_logs_salon_automation_id_fkey"
            columns: ["salon_id", "automation_id"]
            isOneToOne: false
            referencedRelation: "crm_automations"
            referencedColumns: ["salon_id", "id"]
          },
          {
            foreignKeyName: "message_logs_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body: string
          channel: string
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          salon_id: string
          subject: string | null
          updated_at: string | null
        }
        Insert: {
          body: string
          channel: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          salon_id: string
          subject?: string | null
          updated_at?: string | null
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          salon_id?: string
          subject?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_templates_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_last4: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          p24_payment_method_id: string | null
          salon_id: string
          type: string
          updated_at: string | null
        }
        Insert: {
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          p24_payment_method_id?: string | null
          salon_id: string
          type: string
          updated_at?: string | null
        }
        Update: {
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          p24_payment_method_id?: string | null
          salon_id?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_salon_id_fkey"
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
      reminder_rules: {
        Row: {
          created_at: string
          hours_before: number
          id: string
          is_active: boolean
          message_template: string
          require_confirmation: boolean
          salon_id: string
          target_blacklisted_only: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          hours_before: number
          id?: string
          is_active?: boolean
          message_template: string
          require_confirmation?: boolean
          salon_id: string
          target_blacklisted_only?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          hours_before?: number
          id?: string
          is_active?: boolean
          message_template?: string
          require_confirmation?: boolean
          salon_id?: string
          target_blacklisted_only?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_rules_salon_id_fkey"
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
          booksy_auto_create_clients: boolean | null
          booksy_auto_create_services: boolean | null
          booksy_enabled: boolean | null
          booksy_gmail_email: string | null
          booksy_gmail_tokens: Json | null
          booksy_last_sync_at: string | null
          booksy_notify_email: string | null
          booksy_notify_on_cancel: boolean | null
          booksy_notify_on_new: boolean | null
          booksy_sender_filter: string | null
          booksy_sync_interval_minutes: number | null
          booksy_sync_stats: Json | null
          bulkgate_app_id: string | null
          bulkgate_app_token: string | null
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
          p24_api_key: string | null
          p24_api_url: string | null
          p24_crc: string | null
          p24_merchant_id: string | null
          p24_pos_id: string | null
          p24_sandbox_mode: boolean | null
          require_deposit: boolean | null
          resend_api_key: string | null
          resend_from_email: string | null
          resend_from_name: string | null
          salon_id: string
          slot_duration_minutes: number | null
          sms_provider: string
          smsapi_sender_name: string | null
          smsapi_token: string | null
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
          booksy_auto_create_clients?: boolean | null
          booksy_auto_create_services?: boolean | null
          booksy_enabled?: boolean | null
          booksy_gmail_email?: string | null
          booksy_gmail_tokens?: Json | null
          booksy_last_sync_at?: string | null
          booksy_notify_email?: string | null
          booksy_notify_on_cancel?: boolean | null
          booksy_notify_on_new?: boolean | null
          booksy_sender_filter?: string | null
          booksy_sync_interval_minutes?: number | null
          booksy_sync_stats?: Json | null
          bulkgate_app_id?: string | null
          bulkgate_app_token?: string | null
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
          p24_api_key?: string | null
          p24_api_url?: string | null
          p24_crc?: string | null
          p24_merchant_id?: string | null
          p24_pos_id?: string | null
          p24_sandbox_mode?: boolean | null
          require_deposit?: boolean | null
          resend_api_key?: string | null
          resend_from_email?: string | null
          resend_from_name?: string | null
          salon_id: string
          slot_duration_minutes?: number | null
          sms_provider?: string
          smsapi_sender_name?: string | null
          smsapi_token?: string | null
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
          booksy_auto_create_clients?: boolean | null
          booksy_auto_create_services?: boolean | null
          booksy_enabled?: boolean | null
          booksy_gmail_email?: string | null
          booksy_gmail_tokens?: Json | null
          booksy_last_sync_at?: string | null
          booksy_notify_email?: string | null
          booksy_notify_on_cancel?: boolean | null
          booksy_notify_on_new?: boolean | null
          booksy_sender_filter?: string | null
          booksy_sync_interval_minutes?: number | null
          booksy_sync_stats?: Json | null
          bulkgate_app_id?: string | null
          bulkgate_app_token?: string | null
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
          p24_api_key?: string | null
          p24_api_url?: string | null
          p24_crc?: string | null
          p24_merchant_id?: string | null
          p24_pos_id?: string | null
          p24_sandbox_mode?: boolean | null
          require_deposit?: boolean | null
          resend_api_key?: string | null
          resend_from_email?: string | null
          resend_from_name?: string | null
          salon_id?: string
          slot_duration_minutes?: number | null
          sms_provider?: string
          smsapi_sender_name?: string | null
          smsapi_token?: string | null
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
          billing_email: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          features: Json
          id: string
          name: string
          owner_email: string
          settings: Json | null
          slug: string
          subscription_plan: string
          subscription_started_at: string | null
          subscription_status: string
          tax_id: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_email?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          features?: Json
          id?: string
          name: string
          owner_email: string
          settings?: Json | null
          slug: string
          subscription_plan?: string
          subscription_started_at?: string | null
          subscription_status?: string
          tax_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_email?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          features?: Json
          id?: string
          name?: string
          owner_email?: string
          settings?: Json | null
          slug?: string
          subscription_plan?: string
          subscription_started_at?: string | null
          subscription_status?: string
          tax_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      satisfaction_surveys: {
        Row: {
          booking_id: string
          client_id: string
          comment: string | null
          created_at: string
          fill_token: string | null
          fill_token_exp: string | null
          id: string
          nps_score: number | null
          rating: number | null
          salon_id: string
          submitted_at: string | null
        }
        Insert: {
          booking_id: string
          client_id: string
          comment?: string | null
          created_at?: string
          fill_token?: string | null
          fill_token_exp?: string | null
          id?: string
          nps_score?: number | null
          rating?: number | null
          salon_id: string
          submitted_at?: string | null
        }
        Update: {
          booking_id?: string
          client_id?: string
          comment?: string | null
          created_at?: string
          fill_token?: string | null
          fill_token_exp?: string | null
          id?: string
          nps_score?: number | null
          rating?: number | null
          salon_id?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "satisfaction_surveys_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "satisfaction_surveys_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "satisfaction_surveys_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      service_equipment: {
        Row: {
          equipment_id: string
          service_id: string
        }
        Insert: {
          equipment_id: string
          service_id: string
        }
        Update: {
          equipment_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_equipment_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_equipment_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_forms: {
        Row: {
          form_template_id: string
          service_id: string
        }
        Insert: {
          form_template_id: string
          service_id: string
        }
        Update: {
          form_template_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_forms_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_forms_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
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
      sms_messages: {
        Row: {
          body: string
          client_id: string | null
          created_at: string
          delivered_at: string | null
          direction: string
          error_message: string | null
          id: string
          provider_message_id: string | null
          salon_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          body: string
          client_id?: string | null
          created_at?: string
          delivered_at?: string | null
          direction: string
          error_message?: string | null
          id?: string
          provider_message_id?: string | null
          salon_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          body?: string
          client_id?: string | null
          created_at?: string
          delivered_at?: string | null
          direction?: string
          error_message?: string | null
          id?: string
          provider_message_id?: string | null
          salon_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_messages_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_wallet: {
        Row: {
          balance: number
          id: string
          salon_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          id?: string
          salon_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          id?: string
          salon_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_wallet_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: true
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount_cents: number
          billing_interval: string
          canceled_at: string | null
          created_at: string | null
          currency: string
          current_period_end: string
          current_period_start: string
          dunning_attempt: number
          ended_at: string | null
          id: string
          metadata: Json | null
          next_retry_at: string | null
          p24_order_id: string | null
          p24_token: string | null
          p24_transaction_id: string | null
          plan_type: string
          salon_id: string
          status: string
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          amount_cents: number
          billing_interval: string
          canceled_at?: string | null
          created_at?: string | null
          currency?: string
          current_period_end: string
          current_period_start: string
          dunning_attempt?: number
          ended_at?: string | null
          id?: string
          metadata?: Json | null
          next_retry_at?: string | null
          p24_order_id?: string | null
          p24_token?: string | null
          p24_transaction_id?: string | null
          plan_type: string
          salon_id: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          amount_cents?: number
          billing_interval?: string
          canceled_at?: string | null
          created_at?: string | null
          currency?: string
          current_period_end?: string
          current_period_start?: string
          dunning_attempt?: number
          ended_at?: string | null
          id?: string
          metadata?: Json | null
          next_retry_at?: string | null
          p24_order_id?: string | null
          p24_token?: string | null
          p24_transaction_id?: string | null
          plan_type?: string
          salon_id?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_tracking: {
        Row: {
          api_calls_count: number | null
          bookings_count: number | null
          bookings_limit_exceeded: boolean | null
          clients_count: number | null
          clients_limit_exceeded: boolean | null
          created_at: string | null
          emails_limit_exceeded: boolean | null
          emails_sent_count: number | null
          employees_count: number | null
          employees_limit_exceeded: boolean | null
          id: string
          period_month: string
          salon_id: string
          sms_limit_exceeded: boolean | null
          sms_sent_count: number | null
          updated_at: string | null
        }
        Insert: {
          api_calls_count?: number | null
          bookings_count?: number | null
          bookings_limit_exceeded?: boolean | null
          clients_count?: number | null
          clients_limit_exceeded?: boolean | null
          created_at?: string | null
          emails_limit_exceeded?: boolean | null
          emails_sent_count?: number | null
          employees_count?: number | null
          employees_limit_exceeded?: boolean | null
          id?: string
          period_month: string
          salon_id: string
          sms_limit_exceeded?: boolean | null
          sms_sent_count?: number | null
          updated_at?: string | null
        }
        Update: {
          api_calls_count?: number | null
          bookings_count?: number | null
          bookings_limit_exceeded?: boolean | null
          clients_count?: number | null
          clients_limit_exceeded?: boolean | null
          created_at?: string | null
          emails_limit_exceeded?: boolean | null
          emails_sent_count?: number | null
          employees_count?: number | null
          employees_limit_exceeded?: boolean | null
          id?: string
          period_month?: string
          salon_id?: string
          sms_limit_exceeded?: boolean | null
          sms_sent_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_tracking_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_replay_cache: {
        Row: {
          event_id: string
          expires_at: string
        }
        Insert: {
          event_id: string
          expires_at: string
        }
        Update: {
          event_id?: string
          expires_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_vat: { Args: { subtotal_cents: number }; Returns: number }
      check_equipment_availability: {
        Args: {
          p_ends_at: string
          p_equipment_ids: string[]
          p_exclude_booking_id?: string
          p_starts_at: string
        }
        Returns: {
          conflict_booking_id: string
          equipment_id: string
          is_available: boolean
        }[]
      }
      create_booking_atomic: {
        Args: {
          p_base_price: number
          p_booking_date: string
          p_booking_time: string
          p_client_id: string
          p_created_by: string
          p_duration: number
          p_employee_id: string
          p_notes: string
          p_salon_id: string
          p_service_id: string
          p_source: string
          p_status: string
        }
        Returns: {
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
          reminder_sent: boolean
          salon_id: string
          service_id: string
          source: string
          status: string
          surcharge: number
          survey_sent: boolean
          total_price: number | null
          updated_at: string
          updated_by: string | null
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      crm_increment_campaign_counter: {
        Args: {
          p_campaign_id: string
          p_counter_name: string
          p_increment_by?: number
        }
        Returns: undefined
      }
      crm_increment_usage_counter: {
        Args: {
          p_channel: string
          p_increment_by?: number
          p_period_month: string
          p_salon_id: string
        }
        Returns: undefined
      }
      decrement_sms_balance: { Args: { p_salon_id: string }; Returns: boolean }
      generate_client_code: { Args: { salon_uuid: string }; Returns: string }
      generate_employee_code: { Args: { salon_uuid: string }; Returns: string }
      generate_invoice_number: { Args: never; Returns: string }
      get_user_employee_id: { Args: never; Returns: string }
      get_user_salon_id: { Args: never; Returns: string }
      has_any_salon_role: {
        Args: { required_roles: string[] }
        Returns: boolean
      }
      has_salon_role: { Args: { required_role: string }; Returns: boolean }
      increment_client_no_show: {
        Args: { p_client_id: string }
        Returns: undefined
      }
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
      seed_default_crm_templates: {
        Args: { p_salon_id: string }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
