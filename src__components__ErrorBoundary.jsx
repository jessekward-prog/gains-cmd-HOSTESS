import { Component } from 'react';

// React ErrorBoundary — catches rendering errors in the tree below it
// and shows a helpful error UI instead of a blank black screen. This is
// invaluable for diagnosing production crashes because most "app doesn't
// load" reports are actually "a component threw during render and React
// unmounted the whole tree".
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log to console so it shows up in DevTools and Sentry-like tools
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Stack:', errorInfo?.componentStack);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    try {
      sessionStorage.clear();
      // Keep localStorage (user prefs, theme) but nuke session state
    } catch {}
    window.location.reload();
  };

  handleHardReset = () => {
    try {
      sessionStorage.clear();
      // Clear caches so a stale service worker doesn't serve old JS
      if ('caches' in window) {
        caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
      }
    } catch {}
    setTimeout(() => window.location.reload(), 300);
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const errMsg = this.state.error?.message || String(this.state.error || 'Unknown error');
    const stack = this.state.error?.stack || '';
    const compStack = this.state.errorInfo?.componentStack || '';

    return (
      <div style={{
        minHeight: '100dvh',
        background: '#0a0a0a',
        color: '#e0e0e0',
        padding: '24px',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: '12px',
        lineHeight: 1.5,
        overflow: 'auto',
      }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div style={{
            color: '#ff2222',
            fontSize: '14px',
            fontWeight: 600,
            letterSpacing: '2px',
            marginBottom: '8px',
          }}>
            ⚠ APPLICATION ERROR
          </div>
          <div style={{ color: '#999', marginBottom: '20px' }}>
            Something crashed while rendering. The details below will help
            you (or support) figure out what went wrong.
          </div>

          <div style={{
            background: '#1a0505',
            border: '1px solid rgba(255,34,34,0.3)',
            padding: '12px',
            borderRadius: '6px',
            marginBottom: '16px',
          }}>
            <div style={{ color: '#ff6666', fontWeight: 600, marginBottom: '6px' }}>MESSAGE</div>
            <div style={{ color: '#eee', wordBreak: 'break-word' }}>{errMsg}</div>
          </div>

          {stack && (
            <details style={{ marginBottom: '12px' }}>
              <summary style={{ color: '#888', cursor: 'pointer', marginBottom: '6px' }}>Error stack</summary>
              <pre style={{
                background: '#111',
                border: '1px solid #222',
                padding: '10px',
                borderRadius: '4px',
                color: '#aaa',
                fontSize: '10px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
              }}>{stack}</pre>
            </details>
          )}

          {compStack && (
            <details style={{ marginBottom: '20px' }}>
              <summary style={{ color: '#888', cursor: 'pointer', marginBottom: '6px' }}>Component stack</summary>
              <pre style={{
                background: '#111',
                border: '1px solid #222',
                padding: '10px',
                borderRadius: '4px',
                color: '#aaa',
                fontSize: '10px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
              }}>{compStack}</pre>
            </details>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '20px', flexWrap: 'wrap' }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: '10px 16px',
                background: '#ff2222',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              RELOAD
            </button>
            <button
              onClick={this.handleHardReset}
              style={{
                padding: '10px 16px',
                background: 'transparent',
                color: '#ff6666',
                border: '1px solid rgba(255,34,34,0.4)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '12px',
              }}
            >
              HARD RESET (clear caches + SW)
            </button>
          </div>

          <div style={{ color: '#555', marginTop: '24px', fontSize: '10px' }}>
            Tip: if this happens repeatedly, try the hard reset — a stale
            service worker can serve outdated JS that crashes against
            updated API responses.
          </div>
        </div>
      </div>
    );
  }
}
