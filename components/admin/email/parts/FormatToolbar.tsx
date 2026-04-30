"use client";

interface FormatAction {
  label: string;
  shortcut?: string;
  /** Wstawia syntax wokół zaznaczenia, lub na pozycji kursora gdy brak. */
  wrap?: { before: string; after: string; placeholder?: string };
  /** Wstawia syntax na początku linii (dla list, headings, button). */
  linePrefix?: string;
  /** Wstawia template tekst w nowej linii. */
  template?: string;
  icon: React.ReactNode;
}

const FORMAT_ACTIONS: FormatAction[] = [
  {
    label: "Pogrubienie",
    shortcut: "⌘B",
    wrap: { before: "**", after: "**", placeholder: "tekst" },
    icon: <strong className="text-[13px]">B</strong>,
  },
  {
    label: "Kursywa",
    shortcut: "⌘I",
    wrap: { before: "*", after: "*", placeholder: "tekst" },
    icon: <em className="text-[13px]">I</em>,
  },
  {
    label: "Przekreślenie",
    wrap: { before: "~~", after: "~~", placeholder: "tekst" },
    icon: <span className="text-[13px] line-through">S</span>,
  },
  {
    label: "Kod",
    wrap: { before: "`", after: "`", placeholder: "kod" },
    icon: <span className="text-[12px] font-mono">{"<>"}</span>,
  },
  {
    label: "Nagłówek 1",
    linePrefix: "# ",
    icon: <span className="text-[10px] font-bold">H1</span>,
  },
  {
    label: "Nagłówek 2",
    linePrefix: "## ",
    icon: <span className="text-[10px] font-bold">H2</span>,
  },
  {
    label: "Lista punktowana",
    linePrefix: "• ",
    icon: <span className="text-[14px]">•</span>,
  },
  {
    label: "Link",
    wrap: { before: "[", after: "](https://)", placeholder: "tekst linku" },
    icon: <span className="text-[10px] underline">link</span>,
  },
  {
    label: "Przycisk CTA",
    template: "[[Tekst przycisku|https://]]",
    icon: (
      <span className="text-[9px] px-1 py-0.5 bg-[var(--accent)] text-white rounded">
        CTA
      </span>
    ),
  },
  {
    label: "Pozioma linia",
    template: "---",
    icon: <span className="text-[14px]">─</span>,
  },
];

export function FormatToolbar({
  textareaRef,
  value,
  onChange,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (v: string) => void;
}) {
  function applyAction(action: FormatAction) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = value.slice(0, start);
    const selected = value.slice(start, end);
    const after = value.slice(end);

    if (action.wrap) {
      const text = selected || action.wrap.placeholder || "";
      const newValue =
        before + action.wrap.before + text + action.wrap.after + after;
      onChange(newValue);
      const newPos = start + action.wrap.before.length + text.length;
      setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(start + action.wrap!.before.length, newPos);
      }, 0);
      return;
    }
    if (action.linePrefix) {
      // Znajdź początek linii (po ostatnim \n przed start)
      const lineStart = before.lastIndexOf("\n") + 1;
      const newValue =
        value.slice(0, lineStart) + action.linePrefix + value.slice(lineStart);
      onChange(newValue);
      const newPos = start + action.linePrefix.length;
      setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(newPos, newPos);
      }, 0);
      return;
    }
    if (action.template) {
      const insertion =
        (start === 0 || before.endsWith("\n") ? "" : "\n") +
        action.template +
        "\n";
      const newValue = before + insertion + after;
      onChange(newValue);
      const newPos = start + insertion.length;
      setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(newPos, newPos);
      }, 0);
      return;
    }
  }

  return (
    <div className="flex flex-wrap gap-1 mb-2 px-2 py-1.5 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-main)]">
      {FORMAT_ACTIONS.map((a) => (
        <button
          key={a.label}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            applyAction(a);
          }}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--bg-surface)] text-[var(--text-main)]"
          title={`${a.label}${a.shortcut ? ` (${a.shortcut})` : ""}`}
        >
          {a.icon}
        </button>
      ))}
      <div className="flex-1" />
      <div className="text-[10px] text-[var(--text-muted)] self-center px-2">
        Wpisz{" "}
        <kbd className="px-1 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[9px]">
          /
        </kbd>{" "}
        aby wstawić zmienną
      </div>
    </div>
  );
}
