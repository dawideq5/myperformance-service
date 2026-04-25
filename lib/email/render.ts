import {
  getDefaultLayout,
  getLayout,
  getTemplate,
  type EmailLayout,
  type EmailTemplate,
} from "./db";
import { actionByKey } from "./templates-catalog";
import { getBranding } from "./db";

/**
 * Substytucja zmiennych w stylu handlebars:
 *   {{user.firstName}} → wartość z context.user.firstName
 * Nie wspiera helpers/conditional — tylko proste replace.
 */
export function renderVars(
  template: string,
  context: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const value = path
      .split(".")
      .reduce<unknown>((acc, key) => {
        if (acc && typeof acc === "object") {
          return (acc as Record<string, unknown>)[key];
        }
        return undefined;
      }, context);
    if (value === undefined || value === null) return "";
    return String(value);
  });
}

/**
 * Markdown → HTML konwersja minimalna. Obsługuje:
 *   - **bold** / __bold__
 *   - *italic* / _italic_
 *   - bullet lists ("• ", "- ", "* ")
 *   - linki [text](url)
 *   - paragrafy (puste linie)
 *   - line breaks
 * Bardziej zaawansowane MD wymagałoby `marked` ale jako MVP wystarczy to.
 */
export function markdownToHtml(input: string): string {
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const lines = input.split(/\r?\n/);
  const htmlBlocks: string[] = [];
  let currentParagraph: string[] = [];
  let listItems: string[] = [];

  function flushParagraph() {
    if (currentParagraph.length === 0) return;
    const text = currentParagraph.join(" ");
    htmlBlocks.push(`<p style="margin:0 0 16px 0;">${inline(text)}</p>`);
    currentParagraph = [];
  }
  function flushList() {
    if (listItems.length === 0) return;
    const items = listItems
      .map((i) => `<li style="margin:4px 0;">${inline(i)}</li>`)
      .join("");
    htmlBlocks.push(
      `<ul style="margin:0 0 16px 0;padding-left:20px;">${items}</ul>`,
    );
    listItems = [];
  }
  function inline(text: string): string {
    let out = escapeHtml(text);
    // Bold **x** lub __x__
    out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/__(.+?)__/g, "<strong>$1</strong>");
    // Italic *x* lub _x_
    out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    out = out.replace(/_([^_\s][^_]*)_/g, "<em>$1</em>");
    // Linki [text](url)
    out = out.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" style="color:#000;text-decoration:underline;">$1</a>',
    );
    // Bare URLs https://...
    out = out.replace(
      /(^|\s)(https?:\/\/[^\s<]+)/g,
      '$1<a href="$2" style="color:#000;text-decoration:underline;">$2</a>',
    );
    return out;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") {
      flushList();
      flushParagraph();
      continue;
    }
    const bulletMatch = line.match(/^[•\-\*]\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      listItems.push(bulletMatch[1]);
      continue;
    }
    flushList();
    currentParagraph.push(line);
  }
  flushList();
  flushParagraph();

  return htmlBlocks.join("\n");
}

/**
 * Wstawia content do layoutu poprzez {{content}} placeholder.
 */
export function applyLayout(layoutHtml: string, content: string): string {
  if (!layoutHtml.includes("{{content}}")) {
    // Brak slot — fallback: po prostu HTML body.
    return content;
  }
  return layoutHtml.replace(/\{\{\s*content\s*\}\}/g, content);
}

export interface RenderResult {
  subject: string;
  html: string;
  text: string;
}

export interface RenderOptions {
  /** Override template body (np. live preview podczas edycji). */
  draftSubject?: string;
  draftBody?: string;
  /** Override layout id. Domyślnie używamy z template lub default. */
  layoutId?: string | null;
  /**
   * Context zmienne. Zawsze automatycznie dokleja `brand` z mp_branding,
   * `now` z aktualnego czasu. Caller dorzuca user/event/cert/etc.
   */
  context?: Record<string, unknown>;
}

/**
 * Renderuje pełny email dla danej akcji.
 *
 * Pipeline:
 *   1. Pobierz template (DB) lub default z catalog.
 *   2. Pobierz layout (DB).
 *   3. Pobierz brand z mp_branding.
 *   4. Substytuuj zmienne w subject + body.
 *   5. Konwertuj body markdown → HTML.
 *   6. Wsadź do layoutu w {{content}}.
 *   7. Zwróć subject + HTML + plain text fallback.
 */
export async function renderTemplate(
  actionKey: string,
  opts: RenderOptions = {},
): Promise<RenderResult | null> {
  const action = actionByKey(actionKey);
  if (!action) return null;

  const stored: EmailTemplate | null = await getTemplate(actionKey);
  const subject =
    opts.draftSubject ?? stored?.subject ?? action.defaultSubject;
  const body = opts.draftBody ?? stored?.body ?? action.defaultBody;

  let layout: EmailLayout | null = null;
  if (opts.layoutId !== undefined) {
    layout = opts.layoutId ? await getLayout(opts.layoutId) : null;
  } else if (stored?.layoutId) {
    layout = await getLayout(stored.layoutId);
  }
  if (!layout) {
    layout = await getDefaultLayout();
  }

  const branding = await getBranding();
  const now = new Date();
  const baseContext: Record<string, unknown> = {
    brand: {
      name: branding.brandName,
      url: branding.brandUrl ?? "https://myperformance.pl",
      logoUrl: branding.brandLogoUrl ?? "",
      supportEmail: branding.supportEmail ?? "support@myperformance.pl",
      legalName: branding.legalName ?? branding.brandName,
    },
    now: {
      date: now.toLocaleDateString("pl-PL", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      time: now.toLocaleTimeString("pl-PL", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      iso: now.toISOString(),
    },
    subject, // dostępny dla layoutu
  };

  const ctx = mergeDeep(baseContext, opts.context ?? {});

  const renderedSubject = renderVars(subject, ctx);
  const renderedBodyText = renderVars(body, ctx);
  const renderedBodyHtml = markdownToHtml(renderedBodyText);

  const finalContext = { ...ctx, subject: renderedSubject };
  const layoutHtml = layout
    ? renderVars(layout.html, finalContext)
    : `<html><body>{{content}}</body></html>`;
  const html = applyLayout(layoutHtml, renderedBodyHtml);

  return {
    subject: renderedSubject,
    html,
    text: renderedBodyText,
  };
}

function mergeDeep(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof out[k] === "object" &&
      out[k] !== null &&
      !Array.isArray(out[k])
    ) {
      out[k] = mergeDeep(
        out[k] as Record<string, unknown>,
        v as Record<string, unknown>,
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Generuje przykładowy context z `examples` z catalog action — dla preview.
 */
export function exampleContextForAction(actionKey: string): Record<string, unknown> {
  const action = actionByKey(actionKey);
  if (!action) return {};
  const ctx: Record<string, unknown> = {};
  for (const v of action.variables) {
    setNested(ctx, v.key, v.example);
  }
  return ctx;
}

function setNested(target: Record<string, unknown>, path: string, value: string): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}
