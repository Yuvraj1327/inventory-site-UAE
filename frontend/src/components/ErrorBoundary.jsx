import { Component } from "react";
import { Button } from "@/components/ui/button";
import { Warning } from "@phosphor-icons/react";

// Catches render-time errors anywhere below it in the tree (e.g. a bad
// import resolving to a non-component, a bug in a chart/table renderer)
// and shows a recoverable screen instead of a blank white page. Route
// changes reset it via `resetKey` so a broken page doesn't permanently
// wedge the whole app.
//
// The fallback shows the actual caught error and component stack inline
// (not just in the console) so a report of "it broke" always comes with
// the exact message and the component that threw, without needing
// DevTools to have been open at the moment it happened.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // eslint-disable-next-line no-console
    console.error("Render error caught by ErrorBoundary:", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null, info: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center gap-3 px-6">
          <Warning size={32} className="text-destructive" weight="duotone" />
          <h2 className="text-lg font-medium" style={{ fontFamily: "Manrope" }}>This page hit a problem</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Something failed to render. Reloading usually fixes this.
          </p>
          <Button onClick={() => window.location.reload()} className="mt-1 rounded-full">Reload page</Button>
          <div className="mt-4 w-full max-w-2xl text-left">
            <p className="text-xs font-mono text-destructive break-words">{String(this.state.error?.message || this.state.error)}</p>
            {this.state.info?.componentStack && (
              <pre className="mt-2 text-[10px] leading-tight text-muted-foreground bg-muted/50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                {this.state.info.componentStack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
