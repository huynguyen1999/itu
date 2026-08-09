import { useState, type ChangeEvent } from 'react';
import { FileText, Image as ImageIcon, Paperclip, Trash2 } from 'lucide-react';
import type { JournalAttachment } from '../journal.types';
import { enqueueJournalAttachment } from '../attachmentQueue';
import { useDeleteJournalAttachmentMutation } from '../journalMutations';
import { useQueryClient } from '@tanstack/react-query';

interface AttachmentTrayProps {
  entryId: string;
  attachments?: JournalAttachment[];
  onAttachmentAdded?: (attachment: JournalAttachment) => void;
}

export function AttachmentTray({ entryId, attachments = [], onAttachmentAdded }: AttachmentTrayProps) {
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteJournalAttachmentMutation();
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const localAttachment = await enqueueJournalAttachment({ entryId, file });
        if (onAttachmentAdded) onAttachmentAdded(localAttachment as any);
      }
      void queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    } catch (err) {
      console.error('Failed to attach file', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      await deleteMutation.mutateAsync(attachmentId);
      await queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    } catch (err) {
      console.error('Failed to delete attachment', err);
    }
  };

  return (
    <div className="space-y-2 pt-2 border-t border-slate-800/60">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="flex items-center gap-1.5 font-medium">
          <Paperclip className="w-3.5 h-3.5 text-slate-400" />
          Attachments ({attachments.length})
        </span>

        <label className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors">
          <Paperclip className="w-3.5 h-3.5" />
          {isUploading ? 'Attaching...' : 'Add file'}
          <input
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
            disabled={isUploading}
          />
        </label>
      </div>

      {attachments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {attachments.map((att) => {
            const isImage = att.mimeType.startsWith('image/');
            return (
              <div
                key={att.id}
                className="group relative flex items-center gap-2 p-2 rounded-xl bg-slate-900 border border-slate-800/80 hover:border-slate-700 transition-colors"
              >
                {isImage && att.url ? (
                  <img
                    src={att.url}
                    alt={att.fileName}
                    className="w-10 h-10 object-cover rounded-lg bg-slate-950"
                  />
                ) : (
                  <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-950 text-slate-400">
                    {isImage ? <ImageIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-200 truncate">{att.fileName}</div>
                  <div className="text-[10px] text-slate-500">
                    {(att.sizeBytes / 1024).toFixed(0)} KB
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteAttachment(att.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-400 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
