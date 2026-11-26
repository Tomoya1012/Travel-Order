export type SigningAuthority = 'MAYOR' | 'VICE_MAYOR';

export type TravelOrderStatus =
  | 'PENDING_REVIEW'
  | 'FOR_VERIFICATION'
  | 'VERIFIED'
  | 'APPROVED'
  | 'CORRECTION_REQUESTED'
  | 'REJECTED';

export interface AppSettings {
  id: number;
  mayor_name: string;
  mayor_title: string;
  vice_mayor_name: string;
  vice_mayor_title: string;
  mayor_next_seq: number;
  vice_mayor_next_seq: number;
  updated_at?: string;
}

export interface TravelOrderInput {
  signing_authority: SigningAuthority;
  applicant_name: string;
  position: string;
  destination: string;
  departure_date: string;
  return_date: string;
  purpose: string;
  transportation: string;
  accommodation_type: string;
  persons_contacted: string;
  department_head: string;
}

export interface SubmissionResult {
  id: string;
  reference_number: string;
  tracking_token: string;
  signing_authority: SigningAuthority;
  submission_date: string;
  status: TravelOrderStatus;
}

export interface TravelOrderSearchResult {
  reference_number: string;
  applicant_name: string;
  status: TravelOrderStatus;
  submission_date: string;
}

export interface TrackedTravelOrder {
  id: string;
  reference_number: string;
  tracking_token: string;
  travel_order_number: string | null;
  signing_authority: SigningAuthority;
  applicant_name: string;
  position: string;
  destination: string;
  departure_date: string;
  return_date: string;
  purpose: string;
  transportation: string;
  accommodation_type: string;
  persons_contacted: string;
  department_head: string;
  status: TravelOrderStatus;
  submission_date: string;
  review_started_at: string | null;
  verification_date: string | null;
  approval_date: string | null;
  remarks: string | null;
  print_count: number;
  signatory_name: string;
  signatory_title: string;
}

export interface AdminTravelOrder {
  id: string;
  reference_number: string;
  tracking_token: string;
  travel_order_number: string | null;
  signing_authority: SigningAuthority;
  applicant_name: string;
  position: string;
  destination: string;
  departure_date: string;
  return_date: string;
  purpose: string;
  transportation: string;
  accommodation_type: string;
  persons_contacted: string;
  department_head: string;
  status: TravelOrderStatus;
  submission_date: string;
  review_started_at: string | null;
  verification_date: string | null;
  approval_date: string | null;
  verified_by: string | null;
  verified_by_email: string | null;
  approved_by: string | null;
  approved_by_email: string | null;
  signatory_name_snapshot: string | null;
  signatory_title_snapshot: string | null;
  remarks: string | null;
  print_count: number;
  last_printed_at: string | null;
  updated_at: string;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: 'HR_ADMIN' | 'SUPER_ADMIN';
  is_active: boolean;
}

export interface AuditLog {
  id: string;
  action: string;
  travel_order_id: string | null;
  actor_id: string | null;
  actor_label: string;
  created_at: string;
  description: string;
}
