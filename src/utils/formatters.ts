import type { AdminTravelOrder, AuditLog, SigningAuthority, TravelOrderStatus } from '../types/travelOrder';

export function formatDateLong(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatAuthorityLabel(authority: SigningAuthority): string {
  return authority === 'MAYOR' ? 'Municipal Mayor' : 'Municipal Vice Mayor';
}

export function formatStatusLabel(status: TravelOrderStatus): string {
  switch (status) {
    case 'PENDING_REVIEW':
      return 'Pending Review';
    case 'FOR_VERIFICATION':
      return 'For Verification';
    case 'VERIFIED':
      return 'Verified';
    case 'APPROVED':
      return 'Approved';
    case 'CORRECTION_REQUESTED':
      return 'Correction Requested';
    case 'REJECTED':
      return 'Rejected';
    default:
      return status;
  }
}

export function statusBadgeClass(status: TravelOrderStatus): string {
  switch (status) {
    case 'PENDING_REVIEW':
      return 'badge badge-pending';
    case 'FOR_VERIFICATION':
      return 'badge badge-review';
    case 'VERIFIED':
      return 'badge badge-verified';
    case 'APPROVED':
      return 'badge badge-approved';
    case 'CORRECTION_REQUESTED':
      return 'badge badge-correction';
    case 'REJECTED':
      return 'badge badge-rejected';
    default:
      return 'badge';
  }
}

function escapeCsvCell(value: unknown): string {
  const str = value == null ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportOrdersToCsv(orders: AdminTravelOrder[]): void {
  const headers = [
    'Reference Number',
    'Travel Order Number',
    'Status',
    'Signing Authority',
    'Applicant Name',
    'Position',
    'Destination',
    'Departure Date',
    'Return Date',
    'Purpose of Travel',
    'Transportation',
    'Accommodation Type',
    'Persons to be Contacted',
    'Department Head',
    'Submission Date',
    'Verification Date',
    'Verified By',
    'Approval Date',
    'Approved By',
    'Remarks',
    'Print Count',
  ];

  const rows = orders.map((o) =>
    [
      o.reference_number,
      o.travel_order_number || '',
      formatStatusLabel(o.status),
      formatAuthorityLabel(o.signing_authority),
      o.applicant_name,
      o.position,
      o.destination,
      o.departure_date,
      o.return_date,
      o.purpose,
      o.transportation,
      o.accommodation_type,
      o.persons_contacted,
      o.department_head,
      o.submission_date,
      o.verification_date || '',
      o.verified_by_email || '',
      o.approval_date || '',
      o.approved_by_email || '',
      o.remarks || '',
      o.print_count,
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  const csv = '\uFEFF' + [headers.map(escapeCsvCell).join(','), ...rows].join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);
  downloadFile(`anda-travel-orders-${stamp}.csv`, csv, 'text/csv;charset=utf-8;');
}

export function exportAuditLogsToCsv(logs: AuditLog[]): void {
  const headers = ['Timestamp', 'Action', 'Travel Order ID', 'Actor', 'Description'];
  const rows = logs.map((l) =>
    [l.created_at, l.action, l.travel_order_id || '', l.actor_label, l.description]
      .map(escapeCsvCell)
      .join(',')
  );

  const csv = '\uFEFF' + [headers.map(escapeCsvCell).join(','), ...rows].join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);
  downloadFile(`anda-travel-order-audit-logs-${stamp}.csv`, csv, 'text/csv;charset=utf-8;');
}
