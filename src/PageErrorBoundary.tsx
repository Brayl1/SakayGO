import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { resetKey: string; children: ReactNode };
type State = { error: Error | null; key: string };

/**
 * Keeps one broken page from blanking the whole app. Without it, any render or
 * cleanup error unmounts the entire React tree, so the tabs stop working until
 * a reload. The boundary resets itself whenever the route changes.
 */
export default class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("SakayGo page error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="content-page page-error" role="alert">
        <h1>Something went wrong on this page.</h1>
        <p>Try again, or use the tabs to go somewhere else.</p>
        <button type="button" className="primary" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
