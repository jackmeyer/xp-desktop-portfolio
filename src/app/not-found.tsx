// XP-style error dialog on the desktop for unknown URLs (e.g. bad post slugs)
export default function NotFound() {
  return (
    <div
      className="window"
      role="alert"
      style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
    >
      <div className="title-bar">
        <div className="title-bar-text">Error</div>
      </div>
      <div className="window-body">
        <div className="confirm-body">
          <img src="/icons/alert.png" alt="" width="32" height="32" />
          <p>The page you are looking for could not be found. (404)</p>
        </div>
        {/* plain GET form: navigates home with zero client JS */}
        <form action="/" className="field-row" style={{ justifyContent: 'flex-end' }}>
          <button>OK</button>
        </form>
      </div>
    </div>
  );
}
