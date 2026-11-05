import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X, LoaderCircle, FileDown, Search, ChevronDown, ChevronLeft, ChevronRight, CircleAlert } from 'lucide-react';

const ToastContext = createContext(() => {});
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const showToast = useCallback((message, type = 'success') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((items) => [...items, { id, message, type }]);
    window.setTimeout(() => setToasts((items) => items.filter((toast) => toast.id !== id)), 4200);
  }, []);
  return <ToastContext.Provider value={showToast}>{children}<div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div className={`toast toast-${toast.type}`} key={toast.id}>{toast.type === 'success' ? <CheckCircle2 size={18}/> : toast.type === 'error' ? <AlertCircle size={18}/> : <Info size={18}/>}<span>{toast.message}</span><button className="icon-button toast-close" onClick={() => setToasts((items) => items.filter((t) => t.id !== toast.id))} aria-label="Dismiss"><X size={16}/></button></div>)}</div></ToastContext.Provider>;
}
export const useToast = () => useContext(ToastContext);

export function PageHeading({ eyebrow, title, description, actions, children }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow || 'WORKSPACE'}</div><h1>{title}</h1>{description && <p>{description}</p>}</div><div className="heading-actions">{actions}{children}</div></div>;
}

export function StatCard({ item, icon: Icon, index = 0 }) {
  const value = item?.value ?? 0;
  return <article className={`stat-card stat-${item?.tone || 'blue'}`} style={{ animationDelay: `${index * 55}ms` }}>
    <div className="stat-card-top"><div className="stat-icon">{Icon ? <Icon size={19}/> : <CircleAlert size={19}/>}</div><span className="stat-dot"/></div>
    <div className="stat-value">{value}</div><div className="stat-label">{item?.label}</div>
  </article>;
}

const statusMap = {
  approved: 'status-success', published: 'status-success', completed: 'status-success', in_progress: 'status-info',
  submitted: 'status-info', under_review: 'status-warning', pending_review: 'status-warning', scheduled: 'status-info',
  rescheduled: 'status-warning', draft: 'status-neutral', rejected: 'status-danger', cancelled: 'status-danger',
  requires_revision: 'status-danger', finalized: 'status-success', not_registered: 'status-neutral',
};
export function StatusBadge({ status, children }) {
  const label = children || String(status || 'Unknown').replaceAll('_', ' ');
  return <span className={`status-badge ${statusMap[String(status || '').toLowerCase()] || 'status-neutral'}`}><span className="status-point"/>{label}</span>;
}

export function Modal({ open, title, description, onClose, children, size = 'normal' }) {
  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
    <section className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close modal"><X size={20}/></button></div>
      {children}
    </section>
  </div>;
}

export function Field({ label, required, hint, error, children, className = '' }) {
  return <label className={`form-field ${className}`}><span className="field-label">{label}{required && <em> *</em>}</span>{children}{hint && <small className="field-hint">{hint}</small>}{error && <small className="field-error">{error}</small>}</label>;
}

export function LoadingState({ label = 'Loading your workspace…' }) {
  return <div className="loading-state"><LoaderCircle className="spin" size={24}/><span>{label}</span></div>;
}

export function EmptyState({ icon: Icon = Search, title = 'Nothing here yet', description = 'New records will appear here when they are available.', action }) {
  return <div className="empty-state"><div className="empty-state-icon"><Icon size={23}/></div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function ErrorState({ message, onRetry }) {
  return <div className="error-state"><AlertCircle size={20}/><div><strong>We couldn't load this information.</strong><p>{message || 'Check your connection and try again.'}</p></div>{onRetry && <button className="btn btn-secondary btn-small" onClick={onRetry}>Try again</button>}</div>;
}

export function TableToolbar({ search, onSearch, placeholder = 'Search records…', filters, right, count }) {
  return <div className="table-toolbar"><div className="toolbar-search"><Search size={17}/><input aria-label="Search" value={search} onChange={(e) => onSearch?.(e.target.value)} placeholder={placeholder}/>{search && <button className="icon-button" onClick={() => onSearch('')} aria-label="Clear search"><X size={15}/></button>}</div><div className="toolbar-filters">{filters}{right}</div>{count !== undefined && <span className="toolbar-count">{count} records</span>}</div>;
}

export function DataTable({ columns, rows, keyField = 'id', emptyTitle, emptyDescription, onRowClick, pageSize = 10 }) {
  const [page, setPage] = useState(1);
  const safeRows = rows || [];
  const pageCount = Math.max(1, Math.ceil(safeRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  useEffect(() => { setPage(1); }, [rows, pageSize]);
  if (!safeRows.length) return <EmptyState title={emptyTitle || 'No records found'} description={emptyDescription || 'Try changing your search or filters.'}/>;
  const start = (currentPage - 1) * pageSize;
  const visibleRows = safeRows.slice(start, start + pageSize);
  return <div className="table-wrap"><div className="table-scroll"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column.key} className={column.align ? `align-${column.align}` : ''}>{column.label}</th>)}</tr></thead><tbody>{visibleRows.map((row, rowIndex) => <tr key={row[keyField] ?? (start + rowIndex)} onClick={() => onRowClick?.(row)} className={onRowClick ? 'row-clickable' : ''}>{columns.map((column) => <td key={column.key} className={column.align ? `align-${column.align}` : ''}>{column.render ? column.render(row[column.key], row) : (row[column.key] ?? <span className="muted">—</span>)}</td>)}</tr>)}</tbody></table></div>{safeRows.length > pageSize && <div className="table-pagination"><span>Showing {start + 1}–{Math.min(start + pageSize, safeRows.length)} of {safeRows.length}</span><div><button className="icon-button" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page"><ChevronLeft size={17}/></button><span>Page {currentPage} of {pageCount}</span><button className="icon-button" disabled={currentPage >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} aria-label="Next page"><ChevronRight size={17}/></button></div></div>}</div>;
}

export function Button({ variant = 'primary', size = 'normal', icon: Icon, children, className = '', ...props }) {
  return <button className={`btn btn-${variant} ${size === 'small' ? 'btn-small' : ''} ${className}`} {...props}>{Icon && <Icon size={16}/>}{children}</button>;
}

export function ReportButtons({ report, formats = ['csv', 'pdf'], onExport, busy = false }) {
  return <div className="report-buttons">{formats.map((format) => <Button key={format} variant="secondary" size="small" icon={FileDown} disabled={busy} onClick={() => onExport(report, format)}>{format.toUpperCase()}</Button>)}</div>;
}

export function SelectChevron() { return <ChevronDown className="select-chevron" size={16}/>; }
