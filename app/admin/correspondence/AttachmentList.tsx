"use client";

import { Download, Paperclip } from "lucide-react";

export interface Attachment {
  /** ID dla proxy URL — w formacie 'mail:<msgId>:<attId>' lub 'chat:<id>'. */
  proxyId: string;
  filename: string;
  contentType: string;
  size: number;
}

interface AttachmentListProps {
  attachments: Attachment[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentList({ attachments }: AttachmentListProps) {
  if (attachments.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-[var(--text-muted)] flex items-center gap-1">
        <Paperclip className="w-3.5 h-3.5" />
        <span>Załączniki ({attachments.length})</span>
      </div>
      <ul className="space-y-1">
        {attachments.map((a) => {
          const href = `/api/admin/correspondence/attachment/${encodeURIComponent(a.proxyId)}`;
          return (
            <li key={a.proxyId}>
              <a
                href={href}
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--accent)]/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{a.filename}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {a.contentType} · {formatSize(a.size)}
                  </div>
                </div>
                <Download className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
