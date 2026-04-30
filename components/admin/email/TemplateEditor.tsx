"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, Loader2, Save, Send, X } from "lucide-react";

import { Alert, Button, Card, Input } from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api-client";

import { EmailConfirmDialog } from "./parts/EmailConfirmDialog";
import { FormatToolbar } from "./parts/FormatToolbar";
import { NonEditableView } from "./parts/NonEditableView";
import { SlashTextarea } from "./parts/SlashTextarea";
import { TestSendDialog } from "./parts/TestSendDialog";
import { VariablePickerPanel } from "./parts/VariablePickerPanel";
import {
  EMPTY_PICKER_STATE,
  type LayoutOpt,
  type PickerState,
  type SlashTextareaHandle,
  type SmtpConfigOpt,
  type TemplateRow,
} from "./types";

export function TemplateEditor({
  template,
  onClose,
}: {
  template: TemplateRow;
  onClose: () => void;
}) {
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [enabled, setEnabled] = useState(template.enabled);
  const [layoutId, setLayoutId] = useState<string | null>(template.layoutId);
  const [smtpConfigId, setSmtpConfigId] = useState<string | null>(
    template.smtpConfigId,
  );
  const [layouts, setLayouts] = useState<LayoutOpt[]>([]);
  const [smtpConfigs, setSmtpConfigs] = useState<SmtpConfigOpt[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewSubject, setPreviewSubject] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showTestSend, setShowTestSend] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [pickerState, setPickerState] =
    useState<PickerState>(EMPTY_PICKER_STATE);
  const slashHandle = useRef<SlashTextareaHandle | null>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const editable =
    template.editability === "full" ||
    template.editability === "kc-localization";

  // Load options
  useEffect(() => {
    void api
      .get<{ layouts: LayoutOpt[] }>("/api/admin/email/layouts")
      .then((r) => setLayouts(r.layouts));
    void api
      .get<{ configs: SmtpConfigOpt[] }>("/api/admin/email/smtp-configs")
      .then((r) => setSmtpConfigs(r.configs));
  }, []);

  // Live preview — debounce 600ms after edit
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!editable) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const r = await api.post<
          { subject: string; html: string; text: string },
          { draftSubject: string; draftBody: string; layoutId: string | null }
        >(
          `/api/admin/email/templates/${encodeURIComponent(template.actionKey)}/preview`,
          { draftSubject: subject, draftBody: body, layoutId },
        );
        setPreviewHtml(r.html);
        setPreviewSubject(r.subject);
      } catch (err) {
        setError(
          err instanceof ApiRequestError ? err.message : "Preview failed",
        );
      } finally {
        setPreviewLoading(false);
      }
    }, 600);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [subject, body, layoutId, template.actionKey, editable]);

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.patch(
        `/api/admin/email/templates/${encodeURIComponent(template.actionKey)}`,
        { subject, body, enabled, layoutId, smtpConfigId },
      );
      setNotice("Zapisane. Następne maile użyją tej treści.");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function resetToDefault() {
    setBusy(true);
    setError(null);
    try {
      await api.delete(
        `/api/admin/email/templates/${encodeURIComponent(template.actionKey)}`,
      );
      onClose();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Reset failed");
    } finally {
      setBusy(false);
      setShowResetConfirm(false);
    }
  }

  // ── Non-editable views ──────────────────────────────────────────────────
  if (template.editability === "readonly") {
    return (
      <NonEditableView
        template={template}
        onClose={onClose}
        message="Treść tego szablonu jest hardkodowana w kodzie aplikacji i nie może być edytowana z naszego dashboardu. Zmiana wymagałaby forka kodu źródłowego aplikacji."
      />
    );
  }

  if (template.editability === "external-link") {
    return (
      <NonEditableView
        template={template}
        onClose={onClose}
        message="Edycja możliwa w dedykowanym interfejsie aplikacji."
        externalUrl={template.externalEditorUrl}
        externalLabel={template.externalEditorLabel}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<X className="w-4 h-4" />}
              onClick={onClose}
            >
              Wróć do listy
            </Button>
            <h2 className="text-lg font-semibold text-[var(--text-main)] mt-2">
              {template.name}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              <strong>{template.appLabel}</strong> · {template.description}
            </p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              Trigger: {template.trigger}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-4 h-4"
              />
              <span className={enabled ? "text-emerald-400" : "text-red-400"}>
                {enabled ? "Aktywny — wysyła" : "Wyłączony — nie wysyła"}
              </span>
            </label>
          </div>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* LEFT: Editor */}
        <div className="space-y-3">
          <Card padding="md">
            <label className="text-xs text-[var(--text-muted)] block mb-1">
              Temat wiadomości
            </label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Temat z możliwością wstawiania zmiennych"
            />
          </Card>

          <Card padding="md">
            <label className="text-xs text-[var(--text-muted)] block mb-2">
              Treść maila — użyj toolbara, markdown lub klawiszy (⌘B/⌘I)
            </label>
            <FormatToolbar
              textareaRef={bodyTextareaRef}
              value={body}
              onChange={setBody}
            />
            <SlashTextarea
              value={body}
              onChange={setBody}
              variables={template.variables}
              rows={16}
              onPickerStateChange={setPickerState}
              handleRef={slashHandle}
              textareaRef={bodyTextareaRef}
            />
          </Card>

          <Card padding="md">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[var(--text-muted)] block mb-1">
                  Layout (szkielet HTML)
                </label>
                <select
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                  value={layoutId ?? ""}
                  onChange={(e) => setLayoutId(e.target.value || null)}
                >
                  <option value="">— domyślny —</option>
                  {layouts.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                      {l.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] block mb-1">
                  SMTP — przez którą skrzynkę wysyłać
                </label>
                <select
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                  value={smtpConfigId ?? ""}
                  onChange={(e) => setSmtpConfigId(e.target.value || null)}
                >
                  <option value="">— domyślny (transactional) —</option>
                  {smtpConfigs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                      {s.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={save}
              loading={busy}
              leftIcon={<Save className="w-4 h-4" />}
            >
              Zapisz
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowTestSend(true)}
              leftIcon={<Send className="w-4 h-4" />}
            >
              Wyślij testowo
            </Button>
            {template.hasOverride && (
              <Button
                variant="ghost"
                onClick={() => setShowResetConfirm(true)}
                disabled={busy}
              >
                Przywróć domyślne
              </Button>
            )}
          </div>
        </div>

        {/* RIGHT: Variable picker (gdy aktywny) ALBO live preview (default) */}
        <div className="space-y-3">
          {pickerState.open ? (
            <VariablePickerPanel
              state={pickerState}
              onPick={(v) => slashHandle.current?.insertVariable(v)}
              onPickLiteral={(text) =>
                slashHandle.current?.insertLiteral(text)
              }
              onHighlight={(idx) =>
                slashHandle.current?.setHighlightedIdx(idx)
              }
              onClose={() => slashHandle.current?.closePicker()}
            />
          ) : (
            <Card padding="md" className="h-fit">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[var(--accent)]" />
                  Podgląd na żywo
                </h3>
                {previewLoading && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-muted)]" />
                )}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mb-3">
                <strong>Temat:</strong> {previewSubject || subject}
              </div>
              <div className="rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-white">
                <iframe
                  title="Email preview"
                  srcDoc={previewHtml}
                  className="w-full"
                  style={{ height: "720px", border: "none", background: "#fff" }}
                  sandbox="allow-same-origin"
                />
              </div>
            </Card>
          )}
        </div>
      </div>

      {showResetConfirm && (
        <EmailConfirmDialog
          title="Przywróć domyślną treść?"
          description="Twoja edycja zostanie usunięta. Następne maile użyją oryginalnej treści (z katalogu)."
          onConfirm={resetToDefault}
          onCancel={() => setShowResetConfirm(false)}
          confirmLabel="Przywróć"
          confirmVariant="danger"
        />
      )}

      {showTestSend && (
        <TestSendDialog
          actionKey={template.actionKey}
          draftSubject={subject}
          draftBody={body}
          layoutId={layoutId}
          smtpConfigId={smtpConfigId}
          onClose={() => setShowTestSend(false)}
        />
      )}
    </div>
  );
}
