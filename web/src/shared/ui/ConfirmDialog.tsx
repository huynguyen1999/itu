import { AlertTriangle, LoaderCircle } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isPending?: boolean;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  isPending = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={isPending ? undefined : onOpenChange}>
      <DialogContent className="max-w-md gap-5 p-0">
        <div className="border-b bg-destructive/5 px-6 py-5">
          <DialogHeader className="flex-row items-start gap-4 space-y-0 text-left">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-destructive/20 bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <DialogTitle className="text-xl leading-7">{title}</DialogTitle>
              <DialogDescription className="leading-6">{description}</DialogDescription>
            </div>
          </DialogHeader>
        </div>
        <DialogFooter className="gap-2 px-6 pb-6 sm:space-x-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {cancelLabel}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
