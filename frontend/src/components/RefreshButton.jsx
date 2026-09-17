import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowsClockwise } from "@phosphor-icons/react";

/**
 * Manual refresh button — re-runs whatever data-loading function a page
 * already has (its existing `load()`), without a full browser reload and
 * without resetting other UI state (filters, pagination, selection, open
 * dialogs) since the page's own state is untouched — only the data
 * itself gets re-fetched.
 *
 * Usage:
 *   <RefreshButton onRefresh={load} />
 *
 * `onRefresh` can return a promise (most `load()` functions here already
 * do, since they're `api.get(...).then(...)`) — the button shows a brief
 * spin only while that promise is pending, not a full-page spinner.
 */
export function RefreshButton({ onRefresh, label = "Refresh", testid = "refresh-btn", iconOnly = false }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onRefresh();
    } finally {
      setLoading(false);
    }
  };

  if (iconOnly) {
    return (
      <Button variant="ghost" size="icon" onClick={handleClick} disabled={loading} data-testid={testid} title={label} aria-label={label}>
        <ArrowsClockwise size={17} className={loading ? "animate-spin" : ""} />
      </Button>
    );
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={loading} data-testid={testid} className="rounded-full gap-2">
      <ArrowsClockwise size={16} className={loading ? "animate-spin" : ""} />
      {loading ? "Refreshing…" : label}
    </Button>
  );
}
