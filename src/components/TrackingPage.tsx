import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, ArrowLeft, Printer, RefreshCw, Search } from 'lucide-react';
import { travelOrderService } from '../services/travelOrderService';
import type {
  PublicApprovedTravelOrderPrint,
  SigningAuthority,
  TrackedTravelOrder,
  TravelOrderInput,
  TravelOrderSearchResult,
} from '../types/travelOrder';
import {
  formatAuthorityLabel,
  formatDateLong,
  formatDateTime,
  formatStatusLabel,
  statusBadgeClass,
} from '../utils/formatters';
import { PrintableTravelOrder } from './PrintableTravelOrder';

interface TrackingPageProps {
  initialToken: string;
  onBackHome: () => void;
}

/** Returns true if input looks like a tracking URL or 16+ char hex token */
function isTrackingTokenOrUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (trimmed.includes('://') || trimmed.startsWith('/') || trimmed.includes('?token=')) {
    return true;
  }
  return /^[a-f0-9]{16,}$/i.test(trimmed);
}

/** Accepts a full URL like /track/abc123 or just the raw token abc123 */
function extractTrackingToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    if (trimmed.includes('://') || trimmed.startsWith('/')) {
      const url = new URL(trimmed, window.location.origin);
      const fromQuery = url.searchParams.get('token');
      if (fromQuery) return fromQuery.trim();
      const match = url.pathname.match(/\/track\/([^/?#]+)/);
      if (match?.[1]) return decodeURIComponent(match[1]).trim();
    }
  } catch {
    // Fall back to treating it as a raw token
  }
  return trimmed;
}

export function TrackingPage({ initialToken, onBackHome }: TrackingPageProps) {
  const [tokenInput, setTokenInput] = useState(initialToken);
  const [order, setOrder] = useState<TrackedTravelOrder | null>(null);
  const [namePrintOrder, setNamePrintOrder] = useState<PublicApprovedTravelOrderPrint | null>(null);
  const [searchResults, setSearchResults] = useState<TravelOrderSearchResult[]>([]);
  const [loading, setLoading] = useState(Boolean(initialToken));
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard refs prevent double-fire in React StrictMode
  const printingRef = useRef(false);
  const [printingLabel, setPrintingLabel] = useState(false);

  const [editingCorrection, setEditingCorrection] = useState(false);
  const [editForm, setEditForm] = useState<TravelOrderInput | null>(null);
  const resubmittingRef = useRef(false);
  const [resubmittingLabel, setResubmittingLabel] = useState(false);

  const fetchOrder = async (token: string) => {
    const clean = extractTrackingToken(token);
    if (!clean) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    setSearchResults([]);
    try {
      const result = await travelOrderService.getByTrackingToken(clean);
      if (!result) {
        setOrder(null);
        setNotFound(true);
      } else {
        setOrder(result);
        setEditForm({
          signing_authority: result.signing_authority,
          applicant_name: result.applicant_name,
          position: result.position,
          destination: result.destination,
          departure_date: result.departure_date,
          return_date: result.return_date,
          purpose: result.purpose,
          transportation: result.transportation,
          accommodation_type: result.accommodation_type,
          persons_contacted: result.persons_contacted,
          department_head: result.department_head,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch application status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialToken) {
      setTokenInput(initialToken);
      void fetchOrder(initialToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialToken]);

  const handleLookup = async (e: FormEvent) => {
    e.preventDefault();
    const raw = tokenInput.trim();
    if (!raw) return;

    if (isTrackingTokenOrUrl(raw)) {
      const clean = extractTrackingToken(raw);
      if (!clean) return;
      setTokenInput(clean);
      window.history.pushState({}, '', `/track/${encodeURIComponent(clean)}`);
      await fetchOrder(clean);
      return;
    }

    if (raw.length < 2) {
      setError('Please enter at least 2 characters to search by applicant name.');
      return;
    }

    setLoading(true);
    setError(null);
    setNotFound(false);
    setOrder(null);
    setSearchResults([]);
    try {
      const matches = await travelOrderService.searchByName(raw);
      if (matches.length === 0) {
        setNotFound(true);
      } else {
        setSearchResults(matches);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to search applications.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    if (!order || order.status !== 'APPROVED') return;
    if (printingRef.current) return;
    printingRef.current = true;
    setPrintingLabel(true);
    try {
      await travelOrderService.recordPrint(order.id, order.tracking_token);
    } catch {
      // Allow browser print even if the audit log call fails
    } finally {
      setPrintingLabel(false);
      printingRef.current = false;
      window.print();
    }
  };

  const handlePrintNameSearchResult = async (result: TravelOrderSearchResult) => {
    if (result.status !== 'APPROVED' || printingRef.current) return;
    printingRef.current = true;
    setPrintingLabel(true);
    setError(null);
    try {
      const printableOrder = await travelOrderService.getApprovedTravelOrderForNamePrint(
        result.reference_number,
        result.applicant_name
      );
      setNamePrintOrder(printableOrder);
      window.setTimeout(() => {
        try {
          window.print();
        } finally {
          setNamePrintOrder(null);
          setPrintingLabel(false);
          printingRef.current = false;
        }
      }, 80);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to prepare the approved Travel Order.');
      setPrintingLabel(false);
      printingRef.current = false;
    }
  };

  const handleResubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!order || !editForm || resubmittingRef.current) return;
    if (editForm.return_date < editForm.departure_date) {
      setError('Expected Date of Return cannot be earlier than Expected Date of Departure.');
      return;
    }
    resubmittingRef.current = true;
    setResubmittingLabel(true);
    setError(null);
    try {
      const updated = await travelOrderService.resubmitCorrected(order.tracking_token, editForm);
      setOrder(updated);
      setEditingCorrection(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resubmit application.');
    } finally {
      resubmittingRef.current = false;
      setResubmittingLabel(false);
    }
  };

  return (
    <div className="tracking-page">
      <div className="no-print">
        <section className="card">
          <div className="form-header-row">
            <button type="button" className="btn btn-outline btn-sm" onClick={onBackHome}>
              <ArrowLeft size={16} />
              Back to Application Home
            </button>
            {order && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void fetchOrder(order.tracking_token)}
                disabled={loading}
              >
                <RefreshCw size={15} />
                Refresh Status
              </button>
            )}
          </div>

          <h2 className="section-title">Track Travel Order Application</h2>
          <p className="muted">
            Search by applicant name, or paste your private tracking token / link.
          </p>

          <form onSubmit={handleLookup} className="lookup-bar">
            <input
              type="text"
              maxLength={250}
              placeholder="Enter applicant name or paste tracking link..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <Search size={16} />
              {loading ? 'Searching...' : 'Search / Track'}
            </button>
          </form>

          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}

          {notFound && (
            <div className="alert alert-warning" role="status">
              <AlertCircle size={18} />
              No application matched that name or tracking link. Please check and try again.
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="tracked-details">
              <p className="muted" style={{ marginBottom: '10px' }}>
                Found <strong>{searchResults.length}</strong> matching applications. Approved Travel Orders
                can be printed here. Use your private tracking link to view full details or submit corrections.
              </p>
              <div className="table-scroll search-results-desktop">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Reference #</th>
                      <th>Applicant</th>
                      <th>Submitted</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map((item) => (
                      <tr key={item.reference_number}>
                        <td className="mono">{item.reference_number}</td>
                        <td><strong>{item.applicant_name}</strong></td>
                        <td>{formatDateTime(item.submission_date)}</td>
                        <td>
                          <span className={statusBadgeClass(item.status)}>
                            {formatStatusLabel(item.status)}
                          </span>
                        </td>
                        <td>
                          {item.status === 'APPROVED' && (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => void handlePrintNameSearchResult(item)}
                              disabled={printingLabel}
                            >
                              <Printer size={15} />
                              {printingLabel ? 'Preparing...' : 'Print'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="search-results-mobile" aria-label="Matching applications">
                {searchResults.map((item) => (
                  <article className="search-result-card" key={item.reference_number}>
                    <dl className="search-result-summary">
                      <div>
                        <dt>Reference #</dt>
                        <dd className="mono">{item.reference_number}</dd>
                      </div>
                      <div>
                        <dt>Applicant</dt>
                        <dd>
                          <strong>{item.applicant_name}</strong>
                        </dd>
                      </div>
                      <div>
                        <dt>Submitted</dt>
                        <dd>{formatDateTime(item.submission_date)}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>
                          <span className={statusBadgeClass(item.status)}>
                            {formatStatusLabel(item.status)}
                          </span>
                        </dd>
                      </div>
                      {item.status === 'APPROVED' && (
                        <div>
                          <dt>Action</dt>
                          <dd>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => void handlePrintNameSearchResult(item)}
                              disabled={printingLabel}
                            >
                              <Printer size={15} />
                              {printingLabel ? 'Preparing...' : 'Print Travel Order'}
                            </button>
                          </dd>
                        </div>
                      )}
                    </dl>
                  </article>
                ))}
              </div>
            </div>
          )}

          {order && (
            <div className="tracked-details">
              <div className="tracked-top">
                <div>
                  <span className="muted-label">Reference Number</span>
                  <div className="mono-strong">{order.reference_number}</div>
                </div>
                <div>
                  <span className="muted-label">Official Travel Order #</span>
                  <div className="mono-strong">
                    {order.status === 'APPROVED' && order.travel_order_number
                      ? order.travel_order_number
                      : '— Pending Approval —'}
                  </div>
                </div>
                <div>
                  <span className="muted-label">Current Status</span>
                  <div>
                    <span className={statusBadgeClass(order.status)}>
                      {formatStatusLabel(order.status)}
                    </span>
                  </div>
                </div>
              </div>

              {order.remarks && (
                <div
                  className={
                    order.status === 'REJECTED'
                      ? 'alert alert-error'
                      : order.status === 'CORRECTION_REQUESTED'
                        ? 'alert alert-warning'
                        : 'alert alert-info'
                  }
                >
                  <strong>HR / Admin Remarks:</strong> {order.remarks}
                </div>
              )}

              <dl className="summary-grid">
                <div>
                  <dt>Applicant Name</dt>
                  <dd>{order.applicant_name}</dd>
                </div>
                <div>
                  <dt>Position</dt>
                  <dd>{order.position}</dd>
                </div>
                <div>
                  <dt>Signing Authority</dt>
                  <dd>
                    {formatAuthorityLabel(order.signing_authority)} ({order.signatory_name})
                  </dd>
                </div>
                <div>
                  <dt>Destination</dt>
                  <dd>{order.destination}</dd>
                </div>
                <div>
                  <dt>Travel Dates</dt>
                  <dd>
                    {formatDateLong(order.departure_date)} to {formatDateLong(order.return_date)}
                  </dd>
                </div>
                <div>
                  <dt>Submission Date</dt>
                  <dd>{formatDateTime(order.submission_date)}</dd>
                </div>
                <div>
                  <dt>Purpose of Travel</dt>
                  <dd>{order.purpose}</dd>
                </div>
                <div>
                  <dt>Transportation / Accommodation</dt>
                  <dd>
                    {order.transportation} — {order.accommodation_type}
                  </dd>
                </div>
                <div>
                  <dt>Persons to be Contacted</dt>
                  <dd>{order.persons_contacted}</dd>
                </div>
                <div>
                  <dt>Department Head</dt>
                  <dd>{order.department_head}</dd>
                </div>
              </dl>

              {order.status === 'CORRECTION_REQUESTED' && editForm && (
                <div className="correction-panel">
                  {!editingCorrection ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setEditingCorrection(true)}
                    >
                      Edit &amp; Resubmit Application
                    </button>
                  ) : (
                    <form onSubmit={handleResubmit} className="travel-form">
                      <h3>Correct Application Details</h3>
                      <div className="form-grid">
                        <div className="form-group">
                          <label>Signing Authority</label>
                          <select
                            value={editForm.signing_authority}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                signing_authority: e.target.value as SigningAuthority,
                              })
                            }
                          >
                            <option value="MAYOR">Municipal Mayor</option>
                            <option value="VICE_MAYOR">Municipal Vice Mayor</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Name</label>
                          <input
                            required
                            maxLength={150}
                            value={editForm.applicant_name}
                            onChange={(e) =>
                              setEditForm({ ...editForm, applicant_name: e.target.value })
                            }
                          />
                        </div>
                        <div className="form-group">
                          <label>Position</label>
                          <input
                            required
                            maxLength={150}
                            value={editForm.position}
                            onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label>Destination</label>
                          <input
                            required
                            maxLength={250}
                            value={editForm.destination}
                            onChange={(e) =>
                              setEditForm({ ...editForm, destination: e.target.value })
                            }
                          />
                        </div>
                        <div className="form-group">
                          <label>Departure Date</label>
                          <input
                            type="date"
                            required
                            value={editForm.departure_date}
                            onChange={(e) =>
                              setEditForm({ ...editForm, departure_date: e.target.value })
                            }
                          />
                        </div>
                        <div className="form-group">
                          <label>Return Date</label>
                          <input
                            type="date"
                            required
                            min={editForm.departure_date}
                            value={editForm.return_date}
                            onChange={(e) =>
                              setEditForm({ ...editForm, return_date: e.target.value })
                            }
                          />
                        </div>
                        <div className="form-group form-span-2">
                          <label>Purpose of Travel</label>
                          <textarea
                            rows={2}
                            required
                            maxLength={1000}
                            value={editForm.purpose}
                            onChange={(e) => setEditForm({ ...editForm, purpose: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label>Transportation</label>
                          <input
                            required
                            maxLength={150}
                            value={editForm.transportation}
                            onChange={(e) =>
                              setEditForm({ ...editForm, transportation: e.target.value })
                            }
                          />
                        </div>
                        <div className="form-group">
                          <label>Accommodation Type</label>
                          <input
                            required
                            maxLength={150}
                            value={editForm.accommodation_type}
                            onChange={(e) =>
                              setEditForm({ ...editForm, accommodation_type: e.target.value })
                            }
                          />
                        </div>
                        <div className="form-group">
                          <label>Persons to be Contacted</label>
                          <input
                            required
                            maxLength={250}
                            value={editForm.persons_contacted}
                            onChange={(e) =>
                              setEditForm({ ...editForm, persons_contacted: e.target.value })
                            }
                          />
                        </div>
                        <div className="form-group">
                          <label>Department Head</label>
                          <input
                            required
                            maxLength={150}
                            value={editForm.department_head}
                            onChange={(e) =>
                              setEditForm({ ...editForm, department_head: e.target.value })
                            }
                          />
                        </div>
                      </div>
                      <div className="button-row">
                        <button type="submit" className="btn btn-primary" disabled={resubmittingLabel}>
                          {resubmittingLabel ? 'Resubmitting...' : 'Save & Resubmit'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => setEditingCorrection(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {order.status === 'APPROVED' ? (
                <div className="print-ready-banner">
                  <div>
                    <strong>Approved &amp; Ready for Printing</strong>
                    <p className="muted">
                      Your official Travel Order #{order.travel_order_number} is ready. Click the
                      button to print or choose &ldquo;Save as PDF&rdquo; in the browser&apos;s print
                      dialog.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    onClick={() => void handlePrint()}
                    disabled={printingLabel}
                  >
                    <Printer size={18} />
                    {printingLabel ? 'Preparing...' : 'PRINT TRAVEL ORDER'}
                  </button>
                </div>
              ) : (
                <div className="alert alert-info">
                  Printing is disabled until HR/Admin verifies and approves your application.
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Printable Official Document — only visible when printing */}
      {order && order.status === 'APPROVED' && order.travel_order_number && (
        <section className="print-only-container">
          <PrintableTravelOrder
            travelOrderNumber={order.travel_order_number}
            orderDate={order.approval_date || order.submission_date}
            signingAuthority={order.signing_authority}
            signatoryName={order.signatory_name}
            signatoryTitle={order.signatory_title}
            applicantName={order.applicant_name}
            position={order.position}
            destination={order.destination}
            departureDate={order.departure_date}
            returnDate={order.return_date}
            purpose={order.purpose}
            transportation={order.transportation}
            accommodationType={order.accommodation_type}
            personsContacted={order.persons_contacted}
            departmentHead={order.department_head}
            referenceNumber={order.reference_number}
          />
        </section>
      )}
      {namePrintOrder && (
        <section className="print-only-container">
          <PrintableTravelOrder
            travelOrderNumber={namePrintOrder.travel_order_number}
            orderDate={namePrintOrder.order_date}
            signingAuthority={namePrintOrder.signing_authority}
            signatoryName={namePrintOrder.signatory_name}
            signatoryTitle={namePrintOrder.signatory_title}
            applicantName={namePrintOrder.applicant_name}
            position={namePrintOrder.position}
            destination={namePrintOrder.destination}
            departureDate={namePrintOrder.departure_date}
            returnDate={namePrintOrder.return_date}
            purpose={namePrintOrder.purpose}
            transportation={namePrintOrder.transportation}
            accommodationType={namePrintOrder.accommodation_type}
            personsContacted={namePrintOrder.persons_contacted}
            departmentHead={namePrintOrder.department_head}
            referenceNumber={namePrintOrder.reference_number}
          />
        </section>
      )}
    </div>
  );
}
