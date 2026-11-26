import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type {
  AdminTravelOrder,
  AdminUser,
  AppSettings,
  AuditLog,
  SubmissionResult,
  TrackedTravelOrder,
  TravelOrderInput,
} from '../types/travelOrder';

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.'
    );
  }
  return supabase;
}

export const travelOrderService = {
  async getSettings(): Promise<AppSettings> {
    const client = requireClient();
    const { data, error } = await client
      .from('app_settings')
      .select('*')
      .eq('id', 1)
      .single();
    if (error) throw new Error(error.message);
    return data as AppSettings;
  },

  async submitApplication(input: TravelOrderInput): Promise<SubmissionResult> {
    const client = requireClient();
    const { data, error } = await client.rpc('submit_travel_order', {
      p_signing_authority: input.signing_authority,
      p_applicant_name: input.applicant_name,
      p_position: input.position,
      p_destination: input.destination,
      p_departure_date: input.departure_date,
      p_return_date: input.return_date,
      p_purpose: input.purpose,
      p_transportation: input.transportation,
      p_accommodation_type: input.accommodation_type,
      p_persons_contacted: input.persons_contacted,
      p_department_head: input.department_head,
    });
    if (error) throw new Error(error.message);
    return data as SubmissionResult;
  },

  async getByTrackingToken(token: string): Promise<TrackedTravelOrder | null> {
    const client = requireClient();
    const { data, error } = await client.rpc('get_travel_order_by_token', {
      p_token: token.trim(),
    });
    if (error) throw new Error(error.message);
    return (data as TrackedTravelOrder | null) ?? null;
  },

  async resubmitCorrected(token: string, input: TravelOrderInput): Promise<TrackedTravelOrder> {
    const client = requireClient();
    const { data, error } = await client.rpc('resubmit_corrected_travel_order', {
      p_token: token.trim(),
      p_signing_authority: input.signing_authority,
      p_applicant_name: input.applicant_name,
      p_position: input.position,
      p_destination: input.destination,
      p_departure_date: input.departure_date,
      p_return_date: input.return_date,
      p_purpose: input.purpose,
      p_transportation: input.transportation,
      p_accommodation_type: input.accommodation_type,
      p_persons_contacted: input.persons_contacted,
      p_department_head: input.department_head,
    });
    if (error) throw new Error(error.message);
    return data as TrackedTravelOrder;
  },

  async recordPrint(orderId: string, trackingToken?: string): Promise<void> {
    const client = requireClient();
    const { error } = await client.rpc('record_travel_order_print', {
      p_order_id: orderId,
      p_tracking_token: trackingToken ?? null,
    });
    if (error) throw new Error(error.message);
  },

  async signInAdmin(email: string, password: string): Promise<AdminUser> {
    const client = requireClient();
    const { data: authData, error: authErr } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (authErr) throw new Error(authErr.message);
    if (!authData.user) throw new Error('Authentication failed.');

    const admin = await this.getCurrentAdmin();
    if (!admin) {
      await client.auth.signOut();
      throw new Error(
        'This account is not registered as an active HR/Admin user in admin_users.'
      );
    }
    return admin;
  },

  async signOutAdmin(): Promise<void> {
    const client = requireClient();
    const { error } = await client.auth.signOut();
    if (error) throw new Error(error.message);
  },

  async getCurrentAdmin(): Promise<AdminUser | null> {
    const client = requireClient();
    const { data: sessionData } = await client.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return null;

    const { data, error } = await client
      .from('admin_users')
      .select('id, email, full_name, role, is_active')
      .eq('id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as AdminUser | null) ?? null;
  },

  async listAllOrders(): Promise<AdminTravelOrder[]> {
    const client = requireClient();
    const { data, error } = await client
      .from('travel_orders')
      .select('*')
      .order('submission_date', { ascending: false });
    if (error) throw new Error(error.message);
    return (data as AdminTravelOrder[]) ?? [];
  },

  async startReview(orderId: string, remarks?: string): Promise<AdminTravelOrder> {
    const client = requireClient();
    const { data, error } = await client.rpc('admin_start_review', {
      p_order_id: orderId,
      p_remarks: remarks ?? null,
    });
    if (error) throw new Error(error.message);
    return data as AdminTravelOrder;
  },

  async markVerified(orderId: string, remarks?: string): Promise<AdminTravelOrder> {
    const client = requireClient();
    const { data, error } = await client.rpc('admin_verify_order', {
      p_order_id: orderId,
      p_remarks: remarks ?? null,
    });
    if (error) throw new Error(error.message);
    return data as AdminTravelOrder;
  },

  async approveOrder(orderId: string, remarks?: string): Promise<AdminTravelOrder> {
    const client = requireClient();
    const { data, error } = await client.rpc('admin_approve_order', {
      p_order_id: orderId,
      p_remarks: remarks ?? null,
    });
    if (error) throw new Error(error.message);
    return data as AdminTravelOrder;
  },

  async requestCorrection(orderId: string, remarks: string): Promise<AdminTravelOrder> {
    const client = requireClient();
    const { data, error } = await client.rpc('admin_request_correction', {
      p_order_id: orderId,
      p_remarks: remarks,
    });
    if (error) throw new Error(error.message);
    return data as AdminTravelOrder;
  },

  async rejectOrder(orderId: string, remarks: string): Promise<AdminTravelOrder> {
    const client = requireClient();
    const { data, error } = await client.rpc('admin_reject_order', {
      p_order_id: orderId,
      p_remarks: remarks,
    });
    if (error) throw new Error(error.message);
    return data as AdminTravelOrder;
  },

  async updateSettings(settings: {
    mayor_name: string;
    mayor_title: string;
    vice_mayor_name: string;
    vice_mayor_title: string;
    mayor_next_seq: number;
    vice_mayor_next_seq: number;
  }): Promise<AppSettings> {
    const client = requireClient();
    const { data, error } = await client.rpc('admin_update_settings', {
      p_mayor_name: settings.mayor_name,
      p_mayor_title: settings.mayor_title,
      p_vice_mayor_name: settings.vice_mayor_name,
      p_vice_mayor_title: settings.vice_mayor_title,
      p_mayor_next_seq: settings.mayor_next_seq,
      p_vice_mayor_next_seq: settings.vice_mayor_next_seq,
    });
    if (error) throw new Error(error.message);
    return data as AppSettings;
  },

  async listAuditLogs(): Promise<AuditLog[]> {
    const client = requireClient();
    const { data, error } = await client
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    return (data as AuditLog[]) ?? [];
  },
};
