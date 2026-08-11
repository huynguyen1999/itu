import { useState, type ChangeEvent } from 'react';
import { FileText, Image as ImageIcon, Paperclip, Trash2 } from 'lucide-react';
import type { JournalAttachment } from '../journal.types';
import { enqueueJournalAttachment } from '../attachmentQueue';
import { useDeleteJournalAttachmentMutation } from '../journalMutations';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/shared/ui/button';

interface AttachmentTrayProps {
  entryId: string;
  attachments?: JournalAttachment[];
  onAttachmentAdded?: (attachment: JournalAttachment) => void;
}

export function AttachmentTray({ entryId, attachments = [], onAttachmentAdded }: AttachmentTrayProps) {
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteJournalAttachmentMutation();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadError(false);
    try {
      for (const file of Array.from(files)) {
        const localAttachment = await enqueueJournalAttachment({ entryId, file });
        onAttachmentAdded?.(localAttachment as JournalAttachment);
      }
      void queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    } catch {
      setUploadError(true);
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      await deleteMutation.mutateAsync(attachmentId);
      await queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    } catch {
      // Mutation state is rendered on the tray so the user can try again.
    }
  };

  return (
    <div className="space-y-3 border-t border-border pt-3" aria-busy={isUploading}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 font-semibold">
          <Paperclip className="h-3.5 w-3.5 text-primary" />
          Attachments ({attachments.length})
        </span>

        <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[var(--itu-radius-s)] border border-input bg-background px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-within:ring-2 focus-within:ring-ring">
          <Paperclip className="h-3.5 w-3.5 text-primary" />
          {isUploading ? 'Attaching…' : 'Add file'}
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={handleFileChange}
            disabled={isUploading}
            aria-label="Add journal attachment"
          />
        </label>
      </div>

      {uploadError && (
        <p className="text-xs text-destructive" role="alert">
          The attachment could not be queued. Try again.
        </p>
      )}
      {deleteMutation.isError && (
        <p className="text-xs text-destructive" role="alert">
          The attachment could not be deleted. Try again.
        </p>
      )}

      {attachments.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {attachments.map((attachment) => {
            const isImage = attachment.mimeType.startsWith('image/');
            return (
              <div
                key={attachment.id}
                className="group relative flex min-w-0 items-center gap-2 rounded-[var(--itu-radius-m)] border border-border bg-muted/25 p-2 transition-colors hover:bg-muted/50"
              >
                {isImage && attachment.url ? (
                  <img
                    src={attachment.url}
                    alt={attachment.fileName}
                    className="h-10 w-10 shrink-0 rounded-[var(--itu-radius-s)] bg-muted object-cover"
                  />
                ) : (
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--itu-radius-s)] bg-muted text-muted-foreground"
                    aria-hidden="true"
                  >
                    {isImage ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-foreground">{attachment.fileName}</div>
                  <div className="text-[11px] text-muted-foreground">{(attachment.sizeBytes / 1024).toFixed(0)} KB</div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => void handleDeleteAttachment(attachment.id)}
                  disabled={deleteMutation.isPending}
                  aria-label={`Delete attachment ${attachment.fileName}`}
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
