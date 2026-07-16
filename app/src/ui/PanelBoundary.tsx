// Functional isolation for a panel (ADR-008). A panel that throws shows a
// contained fallback with a reload-this-panel affordance, instead of blanking
// the whole interface. This is what makes an agent editing a live panel safe:
// a broken edit degrades one panel, not the surface.
import { Component, type ReactNode } from 'react';

interface Props {
  name: string;
  children: ReactNode;
}
interface State {
  error: Error | null;
  key: number;
}

export class PanelBoundary extends Component<Props, State> {
  state: State = { error: null, key: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error) {
    // A real deployment ships this to the audit sidecar as a panel-fault event.
    console.warn(`[docBox] panel "${this.props.name}" faulted:`, error.message);
  }

  reload = () => this.setState((s) => ({ error: null, key: s.key + 1 }));

  render() {
    if (this.state.error) {
      return (
        <div className="card" style={{ padding: 'var(--s-5)', borderColor: 'var(--rose)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-2)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--rose)' }} />
            <strong>Panel “{this.props.name}” stopped</strong>
          </div>
          <p className="muted" style={{ margin: '0 0 var(--s-3)', fontSize: 'var(--fs-sm)' }}>
            This panel hit an error and was contained. The rest of the interface kept running.
            An agent edit to this panel can be rolled back, or reload just this panel.
          </p>
          <pre className="mono" style={{ margin: '0 0 var(--s-3)', fontSize: 'var(--fs-xs)', color: 'var(--fg-2)', overflowX: 'auto' }}>
            {this.state.error.message}
          </pre>
          <button className="btn" onClick={this.reload}>Reload this panel</button>
        </div>
      );
    }
    return <div key={this.state.key}>{this.props.children}</div>;
  }
}
