/* ============================================================
   COPA DRAFT — ui/modal.jsx
   Generic read-only modal: closes on Esc / backdrop click / ✕,
   and locks the background scroll while open. Mirrors HowToPlay's
   overlay behaviour and reuses the design-system overlay tokens.
   Read-only by design — it just presents content passed as children.
   ============================================================ */
function Modal({ title, eyebrow, onClose, children, footer, wide }) {
  // close on Esc; lock the page scroll while open (restored on unmount)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="cd-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`cd-modal-panel ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="cd-modal-head">
          <div>
            {eyebrow && <span className="tok">{eyebrow}</span>}
            <h3>{title}</h3>
          </div>
          <button className="btn-icon" onClick={onClose} aria-label={window.I18N.t('ui.modal.close')} title={window.I18N.t('ui.modal.closeEsc')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="cd-modal-body">{children}</div>
        {footer && <div className="cd-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

Object.assign(window, { Modal });
