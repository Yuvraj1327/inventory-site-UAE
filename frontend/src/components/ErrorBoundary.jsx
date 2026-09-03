import { Component } from "react";
import { Button } from "@/components/ui/button";
import { Warning } from "@phosphor-icons/react";

// Catches render-time errors anywhere below it in the tree (e.g. a bad
// import resolving to a non-component, a bug in a chart/table renderer)
// and shows a recoverable screen instead of a blank white page. Route
// changes reset it via `resetKey` so a broken page doesn't permanently
// wedge the whole app.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("Render error caught by ErrorBoundary:", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center gap-3 px-6">
          <Warning size={32} className="text-destructive" weight="duotone" />
          <h2 className="text-lg font-medium" style={{ fontFamily: "Manrope" }}>This page hit a problem</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Something failed to render. Reloading usually fixes this — if it keeps happening, check the browser console for details.
          </p>
          <Button onClick={() => window.location.reload()} className="mt-1 rounded-full">Reload page</Button>
        </div>
      );
    }
    return this.props.children;
  }
}


//ErrorBoundary.jsx