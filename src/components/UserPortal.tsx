import { useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, Copy, ExternalLink, FileCheck2, ShieldCheck } from 'lucide-react';
import { travelOrderService } from '../services/travelOrderService';
import type {
  AppSettings,
  SigningAuthority,
  SubmissionResult,
  TravelOrderInput,
} from '../types/travelOrder';
import { formatAuthorityLabel, formatDateTime, formatStatusLabel } from '../utils/formatters';

interface UserPortalProps {
  settings: AppSettings;
  onOpenTracking: (token: string) => void;
}

const initialForm = (authority: SigningAuthority): TravelOrderInput => ({
  signing_authority: authority,
  applicant_name: '',
  position: '',
  destination: '',
  departure_date: '',
  return_date: '',
  purpose: '',
  transportation: '',
  accommodation_type: '',
  persons_contacted: '',
  department_head: '',
});

export function UserPortal({ settings, onOpenTracking }: UserPortalProps) {
  const [selectedAuthority, setSelectedAuthority] = useState<SigningAuthority | null>(null);
  const [form, setForm] = useState<TravelOrderInput>(initialForm('MAYOR'));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<SubmissionResult | null>(null);
  const [copied, setCopied] = useState(false);
  // Guard ref prevents double-submission on accidental double-click
  const submittingRef = useRef(false);

  const handleChooseAuthority = (authority: SigningAuthority) => {
    setSelectedAuthority(authority);
    setForm(initialForm(authority));
    setError(null);
    setConfirmation(null);
  };

  const updateField = <K extends keyof TravelOrderInput>(key: K, value: TravelOrderInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validateForm = (): string | null => {
    const requiredFields: Array<[keyof TravelOrderInput, string]> = [
      ['applicant_name', 'Name'],
      ['position', 'Position'],
      ['destination', 'Destination'],
      ['departure_date', 'Expected Date of Departure'],
      ['return_date', 'Expected Date of Return'],
      ['purpose', 'Purpose of Travel'],
      ['transportation', 'Transportation'],
      ['accommodation_type', 'Accommodation Type'],
      ['persons_contacted', 'Persons to be Contacted'],
      ['department_head', 'Department Head / Recommending Official'],
    ];

    for (const [key, label] of requiredFields) {
      if (!form[key].trim()) {
        return `${label} is required.`;
      }
    }

    if (form.return_date < form.departure_date) {
      return 'Expected Date of Return cannot be earlier than Expected Date of Departure.';
    }

    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Double-click guard: both ref (synchronous) and state (for button UI)
    if (submittingRef.current || submitting) return;

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    submittingRef.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const result = await travelOrderService.submitApplication(form);
      setConfirmation(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit application.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (confirmation) {
    const trackingUrl = `${window.location.origin}/track/${confirmation.tracking_token}`;

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(trackingUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        setCopied(false);
      }
    };

    return (
      <section className="card confirmation-card">
        <div className="confirmation-header">
          <CheckCircle2 size={36} className="icon-success" />
          <div>
            <h2>Travel Order Application Submitted</h2>
            <p className="muted">
              Your application has been recorded and queued for HR/Admin verification.
            </p>
          </div>
        </div>

        <dl className="summary-grid">
          <div>
            <dt>Submission Reference Number</dt>
            <dd className="mono-strong">{confirmation.reference_number}</dd>
          </div>
          <div>
            <dt>Selected Signing Authority</dt>
            <dd>
              {formatAuthorityLabel(confirmation.signing_authority)} —{' '}
              {confirmation.signing_authority === 'MAYOR'
                ? settings.mayor_name
                : settings.vice_mayor_name}
            </dd>
          </div>
          <div>
            <dt>Submission Date</dt>
            <dd>{formatDateTime(confirmation.submission_date)}</dd>
          </div>
          <div>
            <dt>Current Status</dt>
            <dd>
              <span className="badge badge-pending">{formatStatusLabel(confirmation.status)}</span>
            </dd>
          </div>
        </dl>

        <div className="tracking-link-box">
          <label htmlFor="private-tracking-url">Private Tracking Link (Save or bookmark this link)</label>
          <div className="tracking-link-row">
            <input
              id="private-tracking-url"
              type="text"
              readOnly
              value={trackingUrl}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button type="button" className="btn btn-secondary" onClick={handleCopy}>
              <Copy size={16} />
              {copied ? 'Copied' : 'Copy Link'}
            </button>
          </div>
          <p className="field-hint">
            Use this private link to check verification status and print your Travel Order once approved.
          </p>
        </div>

        <div className="button-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onOpenTracking(confirmation.tracking_token)}
          >
            <ExternalLink size={16} />
            Open Tracking Page
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setConfirmation(null);
              setSelectedAuthority(null);
            }}
          >
            Submit Another Application
          </button>
        </div>
      </section>
    );
  }

  if (!selectedAuthority) {
    return (
      <section className="home-portal">
        <div className="hero-banner card">
          <p className="hero-eyebrow">Human Resource Management Office</p>
          <h1>ONLINE TRAVEL ORDER APPLICATION</h1>
          <p className="hero-subtitle">Municipality of Anda, Province of Pangasinan</p>
          <p className="hero-instruction">
            Select the approving authority for your official travel to proceed to the application form.
          </p>

          <div className="authority-grid">
            <button
              type="button"
              className="authority-card"
              onClick={() => handleChooseAuthority('MAYOR')}
            >
              <span className="authority-icon">
                <ShieldCheck size={28} />
              </span>
              <span className="authority-cta">APPLY FOR MAYOR&apos;S APPROVAL</span>
              <span className="authority-official">{settings.mayor_name}</span>
              <span className="authority-role">{settings.mayor_title}</span>
            </button>

            <button
              type="button"
              className="authority-card"
              onClick={() => handleChooseAuthority('VICE_MAYOR')}
            >
              <span className="authority-icon">
                <FileCheck2 size={28} />
              </span>
              <span className="authority-cta">APPLY FOR VICE MAYOR&apos;S APPROVAL</span>
              <span className="authority-official">{settings.vice_mayor_name}</span>
              <span className="authority-role">{settings.vice_mayor_title}</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  const activeOfficialName =
    selectedAuthority === 'MAYOR' ? settings.mayor_name : settings.vice_mayor_name;
  const activeOfficialTitle =
    selectedAuthority === 'MAYOR' ? settings.mayor_title : settings.vice_mayor_title;

  return (
    <section className="card form-card">
      <div className="form-header-row">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => setSelectedAuthority(null)}
        >
          <ArrowLeft size={16} />
          Change Signing Authority
        </button>
        <div className="selected-authority-pill">
          Signing Authority: <strong>{activeOfficialTitle}</strong> ({activeOfficialName})
        </div>
      </div>

      <h2 className="section-title">Travel Order Application Form</h2>
      <p className="muted">
        Complete all required fields accurately. Your submission date is recorded automatically.
      </p>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="travel-form" noValidate>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="applicant_name">
              1. Name <span className="req">*</span>
            </label>
            <input
              id="applicant_name"
              type="text"
              required
              maxLength={150}
              placeholder="e.g., Juan Dela Cruz"
              value={form.applicant_name}
              onChange={(e) => updateField('applicant_name', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="position">
              2. Position <span className="req">*</span>
            </label>
            <input
              id="position"
              type="text"
              required
              maxLength={150}
              placeholder="e.g., Administrative Officer II"
              value={form.position}
              onChange={(e) => updateField('position', e.target.value)}
            />
          </div>

          <div className="form-group form-span-2">
            <label htmlFor="destination">
              3. Destination <span className="req">*</span>
            </label>
            <input
              id="destination"
              type="text"
              required
              maxLength={250}
              placeholder="e.g., Lingayen, Pangasinan / Civil Service Commission Field Office"
              value={form.destination}
              onChange={(e) => updateField('destination', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="departure_date">
              4. Expected Date of Departure <span className="req">*</span>
            </label>
            <input
              id="departure_date"
              type="date"
              required
              value={form.departure_date}
              onChange={(e) => updateField('departure_date', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="return_date">
              5. Expected Date of Return <span className="req">*</span>
            </label>
            <input
              id="return_date"
              type="date"
              required
              min={form.departure_date || undefined}
              value={form.return_date}
              onChange={(e) => updateField('return_date', e.target.value)}
            />
          </div>

          <div className="form-group form-span-2">
            <label htmlFor="purpose">
              6. Purpose of Travel <span className="req">*</span>
            </label>
            <textarea
              id="purpose"
              rows={3}
              required
              maxLength={1000}
              placeholder="State the official purpose of your travel"
              value={form.purpose}
              onChange={(e) => updateField('purpose', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="transportation">
              7. Transportation <span className="req">*</span>
            </label>
            <input
              id="transportation"
              type="text"
              required
              maxLength={150}
              placeholder="e.g., Official Vehicle / Public Utility Vehicle"
              value={form.transportation}
              onChange={(e) => updateField('transportation', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="accommodation_type">
              8. Accommodation Type <span className="req">*</span>
            </label>
            <input
              id="accommodation_type"
              type="text"
              required
              maxLength={150}
              placeholder="e.g., None (Day Trip) / Hotel / Official Quarters"
              value={form.accommodation_type}
              onChange={(e) => updateField('accommodation_type', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="persons_contacted">
              9. Persons to be Contacted <span className="req">*</span>
            </label>
            <input
              id="persons_contacted"
              type="text"
              required
              maxLength={250}
              placeholder="e.g., Regional Director / HR Personnel"
              value={form.persons_contacted}
              onChange={(e) => updateField('persons_contacted', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="department_head">
              10. Department Head / Recommending Official <span className="req">*</span>
            </label>
            <input
              id="department_head"
              type="text"
              required
              maxLength={150}
              placeholder="Name of Department Head"
              value={form.department_head}
              onChange={(e) => updateField('department_head', e.target.value)}
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
            {submitting ? 'Submitting Application...' : 'Submit Travel Order Application'}
          </button>
        </div>
      </form>
    </section>
  );
}
