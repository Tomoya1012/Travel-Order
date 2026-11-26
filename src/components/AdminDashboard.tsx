import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  CheckCircle,
  Download,
  Eye,
  FileSpreadsheet,
  LogOut,
  Printer,
  RefreshCw,
  Search,
  Settings,
  XCircle,
} from 'lucide-react';
import { travelOrderService } from '../services/travelOrderService';
import type {
  AdminTravelOrder,
  AdminUser,
  AppSettings,
  AuditLog,
  SigningAuthority,
  TravelOrderStatus,
} from '../types/travelOrder';
import {
  downloadFile,
  exportAuditLogsToCsv,
  exportOrdersToCsv,
  formatAuthorityLabel,
  formatDateLong,
  formatDateTime,
  formatStatusLabel,
  statusBadgeClass,
} from '../utils/formatters';
import { PrintableTravelOrder } from './PrintableTravelOrder';

interface AdminDashboardProps {
  admin: AdminUser;
  settings: AppSettings;
  onSettingsUpdated: (settings: AppSettings) => void;
  onSignedOut: () => void;
}

type AdminTab = 'applications' | 'logs' | 'settings';

export function AdminDashboard({
  admin,
  settings,
  onSettingsUpdated,
  onSignedOut,
}: AdminDashboardProps) {
  const [tab, setTab] = useState<AdminTab>('applications');
  const [orders, setOrders] = useState<AdminTravelOrder[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [authorityFilter, setAuthorityFilter] = useState<string>('ALL');

  // Review Drawer / Modal
  const [selectedOrder, setSelectedOrder] = useState<AdminTravelOrder | null>(null);
  const [actionRemarks, setActionRemarks] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [printOrder, setPrintOrder] = useState<AdminTravelOrder | null>(null);

  // Settings form
  const [settingsForm, setSettingsForm] = useState({
    mayor_name: settings.mayor_name,
    mayor_title: settings.mayor_title,
    vice_mayor_name: settings.vice_mayor_name,
    vice_mayor_title: settings.vice_mayor_title,
    mayor_next_seq: settings.mayor_next_seq,
    vice_mayor_next_seq: settings.vice_mayor_next_seq,
  });
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    setSettingsForm({
      mayor_name: settings.mayor_name,
      mayor_title: settings.mayor_title,
      vice_mayor_name: settings.vice_mayor_name,
      vice_mayor_title: settings.vice_mayor_title,
      mayor_next_seq: settings.mayor_next_seq,
      vice_mayor_next_seq: settings.vice_mayor_next_seq,
    });
  }, [settings]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ordersData, logsData] = await Promise.all([
        travelOrderService.listAllOrders(),
        travelOrderService.listAuditLogs(),
      ]);
      setOrders(ordersData);
      setLogs(logsData);
      setSelectedOrder((prev) =>
        prev ? ordersData.find((o) => o.id === prev.id) ?? null : null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const counts = useMemo(() => {
    const byStatus: Record<TravelOrderStatus, number> = {
      PENDING_REVIEW: 0,
      FOR_VERIFICATION: 0,
      VERIFIED: 0,
      APPROVED: 0,
      CORRECTION_REQUESTED: 0,
      REJECTED: 0,
    };
    for (const o of orders) {
      byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    }
    return byStatus;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
      if (authorityFilter !== 'ALL' && o.signing_authority !== (authorityFilter as SigningAuthority)) {
        return false;
      }
      if (!q) return true;
      return (
        o.reference_number.toLowerCase().includes(q) ||
        (o.travel_order_number || '').toLowerCase().includes(q) ||
        o.applicant_name.toLowerCase().includes(q) ||
        o.position.toLowerCase().includes(q) ||
        o.destination.toLowerCase().includes(q)
      );
    });
  }, [orders, searchQuery, statusFilter, authorityFilter]);

  const handleSignOut = async () => {
    await travelOrderService.signOutAdmin();
    onSignedOut();
  };

  const runOrderAction = async (
    action: 'start_review' | 'verify' | 'approve' | 'correction' | 'reject'
  ) => {
    if (!selectedOrder || actionBusy) return;
    if ((action === 'correction' || action === 'reject') && !actionRemarks.trim()) {
      setError(
        action === 'correction'
          ? 'Please enter remarks explaining what needs to be corrected.'
          : 'Please enter a rejection reason.'
      );
      return;
    }

    setActionBusy(true);
    setError(null);
    setFeedback(null);
    try {
      let updated: AdminTravelOrder;
      if (action === 'start_review') {
        updated = await travelOrderService.startReview(selectedOrder.id, actionRemarks);
        setFeedback(`Review started for ${updated.reference_number}.`);
      } else if (action === 'verify') {
        updated = await travelOrderService.markVerified(selectedOrder.id, actionRemarks);
        setFeedback(`${updated.reference_number} marked as Verified.`);
      } else if (action === 'approve') {
        updated = await travelOrderService.approveOrder(selectedOrder.id, actionRemarks);
        setFeedback(
          `Approved ${updated.reference_number} — Generated Travel Order #${updated.travel_order_number}.`
        );
        // Refresh settings so next sequence stays current
        const latestSettings = await travelOrderService.getSettings();
        onSettingsUpdated(latestSettings);
      } else if (action === 'correction') {
        updated = await travelOrderService.requestCorrection(selectedOrder.id, actionRemarks);
        setFeedback(`Correction requested for ${updated.reference_number}.`);
      } else {
        updated = await travelOrderService.rejectOrder(selectedOrder.id, actionRemarks);
        setFeedback(`Application ${updated.reference_number} rejected.`);
      }

      setActionRemarks('');
      setSelectedOrder(updated);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setActionBusy(false);
    }
  };

  const handlePrintApproved = async (order: AdminTravelOrder) => {
    if (order.status !== 'APPROVED' || !order.travel_order_number) return;
    setPrintOrder(order);
    try {
      await travelOrderService.recordPrint(order.id);
      await loadData();
    } catch {
      // Allow browser printing even if log update fails
    }
    setTimeout(() => {
      window.print();
    }, 80);
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (savingSettings) return;
    setSavingSettings(true);
    setError(null);
    setFeedback(null);
    try {
      const updated = await travelOrderService.updateSettings({
        ...settingsForm,
        mayor_next_seq: Number(settingsForm.mayor_next_seq),
        vice_mayor_next_seq: Number(settingsForm.vice_mayor_next_seq),
      });
      onSettingsUpdated(updated);
      setFeedback('Signatory and numbering sequence settings saved.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDownloadBackupJson = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      exported_by: admin.email,
      settings,
      travel_orders: orders,
      audit_logs: logs,
    };
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(
      `anda-travel-order-backup-${stamp}.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8;'
    );
  };

  return (
    <div className="admin-dashboard">
      <div className="no-print">
        {/* Top Admin Bar */}
        <div className="admin-topbar card">
          <div>
            <h2>HR / Admin Travel Order Dashboard</h2>
            <p className="muted">
              Signed in as <strong>{admin.full_name}</strong> ({admin.email})
            </p>
          </div>
          <div className="button-row">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => void loadData()}
              disabled={loading}
            >
              <RefreshCw size={15} />
              Refresh
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={handleSignOut}>
              <LogOut size={15} />
              Sign Out
            </button>
          </div>
        </div>

        {/* Sub-navigation */}
        <div className="admin-tabs">
          <button
            type="button"
            className={`tab-btn ${tab === 'applications' ? 'active' : ''}`}
            onClick={() => setTab('applications')}
          >
            Applications ({orders.length})
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === 'logs' ? 'active' : ''}`}
            onClick={() => setTab('logs')}
          >
            Activity Logs ({logs.length})
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === 'settings' ? 'active' : ''}`}
            onClick={() => setTab('settings')}
          >
            <Settings size={15} />
            Settings &amp; Backup
          </button>
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        {feedback && (
          <div className="alert alert-success" role="status">
            {feedback}
          </div>
        )}

        {tab === 'applications' && (
          <>
            {/* Status Counters */}
            <div className="counters-grid">
              <button
                type="button"
                className={`counter-card ${statusFilter === 'PENDING_REVIEW' ? 'active' : ''}`}
                onClick={() =>
                  setStatusFilter(statusFilter === 'PENDING_REVIEW' ? 'ALL' : 'PENDING_REVIEW')
                }
              >
                <span className="counter-label">Pending Applications</span>
                <span className="counter-value">{counts.PENDING_REVIEW}</span>
              </button>
              <button
                type="button"
                className={`counter-card ${statusFilter === 'FOR_VERIFICATION' ? 'active' : ''}`}
                onClick={() =>
                  setStatusFilter(
                    statusFilter === 'FOR_VERIFICATION' ? 'ALL' : 'FOR_VERIFICATION'
                  )
                }
              >
                <span className="counter-label">For Verification</span>
                <span className="counter-value">{counts.FOR_VERIFICATION}</span>
              </button>
              <button
                type="button"
                className={`counter-card ${statusFilter === 'VERIFIED' ? 'active' : ''}`}
                onClick={() => setStatusFilter(statusFilter === 'VERIFIED' ? 'ALL' : 'VERIFIED')}
              >
                <span className="counter-label">Verified</span>
                <span className="counter-value">{counts.VERIFIED}</span>
              </button>
              <button
                type="button"
                className={`counter-card ${statusFilter === 'APPROVED' ? 'active' : ''}`}
                onClick={() => setStatusFilter(statusFilter === 'APPROVED' ? 'ALL' : 'APPROVED')}
              >
                <span className="counter-label">Approved</span>
                <span className="counter-value">{counts.APPROVED}</span>
              </button>
              <button
                type="button"
                className={`counter-card ${statusFilter === 'REJECTED' ? 'active' : ''}`}
                onClick={() => setStatusFilter(statusFilter === 'REJECTED' ? 'ALL' : 'REJECTED')}
              >
                <span className="counter-label">Rejected</span>
                <span className="counter-value">{counts.REJECTED}</span>
              </button>
            </div>

            {/* Search & Filter Toolbar */}
            <div className="card table-card">
              <div className="toolbar-row">
                <div className="search-box">
                  <Search size={16} />
                  <input
                    type="text"
                    placeholder="Search reference #, Travel Order #, name, position, destination..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING_REVIEW">Pending Review</option>
                  <option value="FOR_VERIFICATION">For Verification</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="APPROVED">Approved</option>
                  <option value="CORRECTION_REQUESTED">Correction Requested</option>
                  <option value="REJECTED">Rejected</option>
                </select>
                <select
                  aria-label="Filter by signing authority"
                  value={authorityFilter}
                  onChange={(e) => setAuthorityFilter(e.target.value)}
                >
                  <option value="ALL">All Authorities</option>
                  <option value="MAYOR">Municipal Mayor</option>
                  <option value="VICE_MAYOR">Municipal Vice Mayor</option>
                </select>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => exportOrdersToCsv(filteredOrders)}
                >
                  <FileSpreadsheet size={15} />
                  Export CSV
                </button>
              </div>

              {/* Applications Table */}
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Reference Number</th>
                      <th>Applicant Name</th>
                      <th>Position</th>
                      <th>Destination</th>
                      <th>Travel Date</th>
                      <th>Signing Authority</th>
                      <th>Submission Date</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && orders.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="empty-cell">
                          Loading applications...
                        </td>
                      </tr>
                    ) : filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="empty-cell">
                          No travel order applications match your filter.
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map((order) => (
                        <tr key={order.id}>
                          <td>
                            <div className="mono-strong">{order.reference_number}</div>
                            {order.travel_order_number && (
                              <div className="to-sub">TO #: {order.travel_order_number}</div>
                            )}
                          </td>
                          <td>{order.applicant_name}</td>
                          <td>{order.position}</td>
                          <td>{order.destination}</td>
                          <td>{formatDateLong(order.departure_date)}</td>
                          <td>{formatAuthorityLabel(order.signing_authority)}</td>
                          <td>{formatDateTime(order.submission_date)}</td>
                          <td>
                            <span className={statusBadgeClass(order.status)}>
                              {formatStatusLabel(order.status)}
                            </span>
                          </td>
                          <td>
                            <div className="table-actions">
                              <button
                                type="button"
                                className="btn btn-secondary btn-xs"
                                onClick={() => {
                                  setSelectedOrder(order);
                                  setActionRemarks(order.remarks || '');
                                  setError(null);
                                }}
                              >
                                <Eye size={14} />
                                Review
                              </button>
                              {order.status === 'APPROVED' && (
                                <button
                                  type="button"
                                  className="btn btn-primary btn-xs"
                                  onClick={() => void handlePrintApproved(order)}
                                >
                                  <Printer size={14} />
                                  Print
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {tab === 'logs' && (
          <div className="card table-card">
            <div className="toolbar-row">
              <h3>System Activity &amp; Audit Logs</h3>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => exportAuditLogsToCsv(logs)}
              >
                <FileSpreadsheet size={15} />
                Export Activity Logs CSV
              </button>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>User / Admin</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="empty-cell">
                        No audit log entries recorded yet.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id}>
                        <td>{formatDateTime(log.created_at)}</td>
                        <td>
                          <span className="badge badge-neutral">{log.action}</span>
                        </td>
                        <td>{log.actor_label}</td>
                        <td>{log.description}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <div className="settings-grid">
            <section className="card">
              <h3>Signatory &amp; Travel Order Numbering Settings</h3>
              <p className="muted">
                Update signatory names when officials change and configure separate sequential
                numbers for Mayor and Vice Mayor Travel Orders (format: <code>SEQUENCE-YEAR</code>).
              </p>

              <form onSubmit={handleSaveSettings} className="travel-form">
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="mayor_name">Municipal Mayor Name</label>
                    <input
                      id="mayor_name"
                      required
                      value={settingsForm.mayor_name}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, mayor_name: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="mayor_title">Municipal Mayor Title</label>
                    <input
                      id="mayor_title"
                      required
                      value={settingsForm.mayor_title}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, mayor_title: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="vice_mayor_name">Municipal Vice Mayor Name</label>
                    <input
                      id="vice_mayor_name"
                      required
                      value={settingsForm.vice_mayor_name}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, vice_mayor_name: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="vice_mayor_title">Municipal Vice Mayor Title</label>
                    <input
                      id="vice_mayor_title"
                      required
                      value={settingsForm.vice_mayor_title}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, vice_mayor_title: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group form-span-2">
                    <label htmlFor="mayor_next_seq">
                      Next Travel Order Sequence Number (Synced for Mayor &amp; Vice Mayor)
                    </label>
                    <input
                      id="mayor_next_seq"
                      type="number"
                      min={1}
                      required
                      value={Math.max(settingsForm.mayor_next_seq, settingsForm.vice_mayor_next_seq)}
                      onChange={(e) => {
                        const nextSeq = Number(e.target.value);
                        setSettingsForm({
                          ...settingsForm,
                          mayor_next_seq: nextSeq,
                          vice_mayor_next_seq: nextSeq,
                        });
                      }}
                    />
                    <span className="field-hint">
                      Next TO # (Mayor or Vice Mayor):{' '}
                      {String(
                        Math.max(settingsForm.mayor_next_seq, settingsForm.vice_mayor_next_seq)
                      ).padStart(4, '0')}
                      -{new Date().getFullYear()}
                    </span>
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" disabled={savingSettings}>
                  {savingSettings ? 'Saving Settings...' : 'Save Settings'}
                </button>
              </form>
            </section>

            <section className="card">
              <h3>Admin Backup &amp; Log Export</h3>
              <p className="muted">
                Download CSV spreadsheets or a full JSON backup directly to this administrator&apos;s
                computer.
              </p>
              <div className="backup-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => exportOrdersToCsv(orders)}
                >
                  <FileSpreadsheet size={16} />
                  Export Application Records to CSV ({orders.length})
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => exportAuditLogsToCsv(logs)}
                >
                  <FileSpreadsheet size={16} />
                  Export Activity Logs to CSV ({logs.length})
                </button>
                <button type="button" className="btn btn-primary" onClick={handleDownloadBackupJson}>
                  <Download size={16} />
                  Download Full Backup File (.json)
                </button>
              </div>
            </section>
          </div>
        )}

        {/* Application Review Modal */}
        {selectedOrder && (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal-panel card">
              <div className="modal-header">
                <div>
                  <h3>Application Review — {selectedOrder.reference_number}</h3>
                  <div className="modal-sub">
                    <span className={statusBadgeClass(selectedOrder.status)}>
                      {formatStatusLabel(selectedOrder.status)}
                    </span>
                    {selectedOrder.travel_order_number && (
                      <span className="mono-strong">
                        Travel Order #{selectedOrder.travel_order_number}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setSelectedOrder(null)}
                >
                  Close
                </button>
              </div>

              <dl className="summary-grid">
                <div>
                  <dt>Signing Authority</dt>
                  <dd>{formatAuthorityLabel(selectedOrder.signing_authority)}</dd>
                </div>
                <div>
                  <dt>Submission Date</dt>
                  <dd>{formatDateTime(selectedOrder.submission_date)}</dd>
                </div>
                <div>
                  <dt>Applicant Name</dt>
                  <dd>{selectedOrder.applicant_name}</dd>
                </div>
                <div>
                  <dt>Position</dt>
                  <dd>{selectedOrder.position}</dd>
                </div>
                <div>
                  <dt>Destination</dt>
                  <dd>{selectedOrder.destination}</dd>
                </div>
                <div>
                  <dt>Department Head</dt>
                  <dd>{selectedOrder.department_head}</dd>
                </div>
                <div>
                  <dt>Expected Date of Departure</dt>
                  <dd>{formatDateLong(selectedOrder.departure_date)}</dd>
                </div>
                <div>
                  <dt>Expected Date of Return</dt>
                  <dd>{formatDateLong(selectedOrder.return_date)}</dd>
                </div>
                <div>
                  <dt>Transportation</dt>
                  <dd>{selectedOrder.transportation}</dd>
                </div>
                <div>
                  <dt>Accommodation Type</dt>
                  <dd>{selectedOrder.accommodation_type}</dd>
                </div>
                <div className="form-span-2">
                  <dt>Purpose of Travel</dt>
                  <dd>{selectedOrder.purpose}</dd>
                </div>
                <div className="form-span-2">
                  <dt>Persons to be Contacted</dt>
                  <dd>{selectedOrder.persons_contacted}</dd>
                </div>
                {selectedOrder.verified_by_email && (
                  <div>
                    <dt>Verified By</dt>
                    <dd>
                      {selectedOrder.verified_by_email} (
                      {formatDateTime(selectedOrder.verification_date)})
                    </dd>
                  </div>
                )}
                {selectedOrder.approved_by_email && (
                  <div>
                    <dt>Approved By</dt>
                    <dd>
                      {selectedOrder.approved_by_email} (
                      {formatDateTime(selectedOrder.approval_date)})
                    </dd>
                  </div>
                )}
              </dl>

              <div className="form-group">
                <label htmlFor="admin-remarks">
                  HR / Admin Remarks (required for Request Correction or Reject)
                </label>
                <textarea
                  id="admin-remarks"
                  rows={2}
                  placeholder="Enter verification notes, correction instructions, or rejection reason..."
                  value={actionRemarks}
                  onChange={(e) => setActionRemarks(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={
                    actionBusy ||
                    (selectedOrder.status !== 'PENDING_REVIEW' &&
                      selectedOrder.status !== 'CORRECTION_REQUESTED')
                  }
                  onClick={() => void runOrderAction('start_review')}
                >
                  1. START REVIEW
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={
                    actionBusy ||
                    (selectedOrder.status !== 'FOR_VERIFICATION' &&
                      selectedOrder.status !== 'PENDING_REVIEW')
                  }
                  onClick={() => void runOrderAction('verify')}
                >
                  <CheckCircle size={15} />
                  2. MARK AS VERIFIED
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={actionBusy || selectedOrder.status !== 'VERIFIED'}
                  title={
                    selectedOrder.status !== 'VERIFIED'
                      ? 'Application must be verified before approval'
                      : 'Approve and generate official Travel Order Number'
                  }
                  onClick={() => void runOrderAction('approve')}
                >
                  3. APPROVE
                </button>

                <button
                  type="button"
                  className="btn btn-warning"
                  disabled={
                    actionBusy ||
                    selectedOrder.status === 'APPROVED' ||
                    selectedOrder.status === 'REJECTED'
                  }
                  onClick={() => void runOrderAction('correction')}
                >
                  4. REQUEST CORRECTION
                </button>

                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={
                    actionBusy ||
                    selectedOrder.status === 'APPROVED' ||
                    selectedOrder.status === 'REJECTED'
                  }
                  onClick={() => void runOrderAction('reject')}
                >
                  <XCircle size={15} />
                  5. REJECT
                </button>

                {selectedOrder.status === 'APPROVED' && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void handlePrintApproved(selectedOrder)}
                  >
                    <Printer size={15} />
                    PRINT TRAVEL ORDER
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Printable Official Document for Admin */}
      {printOrder && printOrder.status === 'APPROVED' && printOrder.travel_order_number && (
        <section className="print-only-container">
          <PrintableTravelOrder
            travelOrderNumber={printOrder.travel_order_number}
            orderDate={printOrder.approval_date || printOrder.submission_date}
            signingAuthority={printOrder.signing_authority}
            signatoryName={
              printOrder.signatory_name_snapshot ||
              (printOrder.signing_authority === 'MAYOR'
                ? settings.mayor_name
                : settings.vice_mayor_name)
            }
            signatoryTitle={
              printOrder.signatory_title_snapshot ||
              (printOrder.signing_authority === 'MAYOR'
                ? settings.mayor_title
                : settings.vice_mayor_title)
            }
            applicantName={printOrder.applicant_name}
            position={printOrder.position}
            destination={printOrder.destination}
            departureDate={printOrder.departure_date}
            returnDate={printOrder.return_date}
            purpose={printOrder.purpose}
            transportation={printOrder.transportation}
            accommodationType={printOrder.accommodation_type}
            personsContacted={printOrder.persons_contacted}
            departmentHead={printOrder.department_head}
            referenceNumber={printOrder.reference_number}
          />
        </section>
      )}
    </div>
  );
}
