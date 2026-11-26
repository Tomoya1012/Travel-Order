import type { SigningAuthority } from '../types/travelOrder';
import { formatDateLong } from '../utils/formatters';

interface PrintableTravelOrderProps {
  travelOrderNumber: string;
  orderDate: string;
  signingAuthority: SigningAuthority;
  signatoryName: string;
  signatoryTitle: string;
  applicantName: string;
  position: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  purpose: string;
  transportation: string;
  accommodationType: string;
  personsContacted: string;
  departmentHead: string;
  referenceNumber?: string;
}

export function PrintableTravelOrder({
  travelOrderNumber,
  orderDate,
  signatoryName,
  signatoryTitle,
  applicantName,
  position,
  destination,
  departureDate,
  returnDate,
  purpose,
  transportation,
  accommodationType,
  personsContacted,
  departmentHead,
}: PrintableTravelOrderProps) {
  return (
    <article className="official-sheet" aria-label="Official Travel Order Document">
      {/* ── Header ── */}
      <header className="sheet-header">
        {/* Left logo: Municipal Seal of Anda */}
        <div className="sheet-logo-box">
          <img
            src="/assets/seal-anda.png"
            alt="Official Seal — Municipality of Anda, Pangasinan"
            className="sheet-logo"
          />
        </div>

        {/* Centre title block */}
        <div className="sheet-title-block">
          <p className="sheet-country">Republic of the Philippines</p>
          <p className="sheet-province">Province of Pangasinan</p>
          <p className="sheet-municipality">MUNICIPALITY OF ANDA</p>
        </div>

        {/* Right logo: HRMO logo */}
        <div className="sheet-logo-box">
          <img
            src="/assets/logo-hrmo.png"
            alt="Human Resource Management Office — Anda, Pangasinan"
            className="sheet-logo"
          />
        </div>
      </header>

      {/* ── Travel Order # and Date Row ── */}
      <div className="sheet-meta-row">
        <div className="sheet-to-number">
          <span className="sheet-to-label">TRAVEL ORDER #:</span>{' '}
          <span className="sheet-to-value">{travelOrderNumber}</span>
        </div>
        <div className="sheet-date-box">
          <div className="sheet-date-line">{formatDateLong(orderDate)}</div>
          <div className="sheet-date-caption">Date</div>
        </div>
      </div>

      {/* ── Form Fields ── */}
      <section className="sheet-fields">
        <div className="sheet-field-row">
          <span className="sheet-field-label">NAME:</span>
          <span className="sheet-field-value">{applicantName}</span>
        </div>
        <div className="sheet-field-row">
          <span className="sheet-field-label">POSITION:</span>
          <span className="sheet-field-value">{position}</span>
        </div>
        <div className="sheet-field-row">
          <span className="sheet-field-label">DESTINATION:</span>
          <span className="sheet-field-value">{destination}</span>
        </div>
        <div className="sheet-field-row">
          <span className="sheet-field-label">EXPECTED DATE OF DEPARTURE:</span>
          <span className="sheet-field-value">{formatDateLong(departureDate)}</span>
        </div>
        <div className="sheet-field-row">
          <span className="sheet-field-label">EXPECTED DATE OF RETURN:</span>
          <span className="sheet-field-value">{formatDateLong(returnDate)}</span>
        </div>
        <div className="sheet-field-row">
          <span className="sheet-field-label">PURPOSE OF TRAVEL:</span>
          <span className="sheet-field-value">{purpose}</span>
        </div>
        <div className="sheet-field-row">
          <span className="sheet-field-label">TRANSPORTATION:</span>
          <span className="sheet-field-value">{transportation}</span>
        </div>
        <div className="sheet-field-row">
          <span className="sheet-field-label">ACCOMMODATION TYPE:</span>
          <span className="sheet-field-value">{accommodationType}</span>
        </div>
        <div className="sheet-field-row">
          <span className="sheet-field-label">PERSONS TO BE CONTACTED:</span>
          <span className="sheet-field-value">{personsContacted}</span>
        </div>
      </section>

      {/* ── Signature Block ── */}
      <footer className="sheet-signatures">
        {/* Left — Recommended By */}
        <div className="sheet-sig-col">
          <div className="sheet-sig-heading">RECOMMENDED BY:</div>
          <div className="sheet-sig-space">
            <span className="sheet-dept-head-name">{departmentHead}</span>
          </div>
          <div className="sheet-sig-underline">Department Head</div>
        </div>

        {/* Right — Approved By */}
        <div className="sheet-sig-col sheet-sig-col--right">
          <div className="sheet-sig-heading">APPROVED BY:</div>
          <div className="sheet-sig-space">
            <div className="sheet-approver-name">{signatoryName}</div>
          </div>
          <div className="sheet-approver-title">{signatoryTitle}</div>
        </div>
      </footer>
    </article>
  );
}
