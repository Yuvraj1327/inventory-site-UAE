import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Warning } from "@phosphor-icons/react";

/**
 * Mandatory 2-step delete confirmation, reusable across every page with
 * a delete action. First click (wherever a page currently calls its
 * delete function directly) instead calls `requestDelete(...)`, which
 * only opens this dialog — nothing is deleted yet. The actual delete
 * function only ever runs when "Confirm Delete" is explicitly clicked
 * inside the dialog. Closing/cancelling calls nothing.
 *
 * This deliberately does not touch what the delete function itself
 * does (still the exact same API call, same permissions, same
 * business logic on every page) — it only gates *when* that function
 * is allowed to run.
 *
 * Usage in any page:
 *   const { requestDelete, ConfirmDeleteDialog } = useConfirmDelete();
 *   ...
 *   <button onClick={() => requestDelete(p.name, () => remove(p._id))}>
 *     <Trash />
 *   </button>
 *   ...
 *   return (
 *     <div>
 *       ...page content...
 *       <ConfirmDeleteDialog />
 *     </div>
 *   );
 */
export function useConfirmDelete() {
  const [target, setTarget] = useState(null); // { label, onConfirm } | null
  const [deleting, setDeleting] = useState(false);

  const requestDelete = (label, onConfirm) => {
    if (deleting) return;
    setTarget({ label, onConfirm });
  };

  const cancel = () => {
    if (deleting) return; // don't allow closing mid-delete
    setTarget(null);
  };

  const confirm = async () => {
    if (!target) return;
    setDeleting(true);
    try {
      await target.onConfirm();
    } finally {
      setDeleting(false);
      setTarget(null);
    }
  };

  const ConfirmDeleteDialog = () => (
    <Dialog open={!!target} onOpenChange={(open) => !open && cancel()}>
      <DialogContent className="max-w-sm" data-testid="confirm-delete-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
              <Warning size={18} weight="fill" />
            </div>
            <DialogTitle className="font-semibold" style={{ fontFamily: "Manrope" }}>Delete {target?.label || "this item"}?</DialogTitle>
          </div>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">This action is permanent and cannot be undone.</p>
        <DialogFooter>
          <Button variant="outline" onClick={cancel} disabled={deleting} data-testid="cancel-delete-btn">Cancel</Button>
          <Button variant="destructive" onClick={confirm} disabled={deleting} data-testid="confirm-delete-btn">
            {deleting ? "Deleting…" : "Confirm Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { requestDelete, ConfirmDeleteDialog };
}
