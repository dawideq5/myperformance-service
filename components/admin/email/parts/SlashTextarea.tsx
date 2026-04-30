"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Textarea } from "@/components/ui";
import { filterVariables } from "@/lib/services/email-service";

import type {
  CatalogVariable,
  PickerState,
  SlashTextareaHandle,
} from "../types";

/**
 * Textarea that supports a `/` slash-command picker for inserting template
 * variables. Picker UI is rendered separately by the parent component (which
 * receives `PickerState` via `onPickerStateChange`) so the picker can occupy
 * the right column of the editor screen.
 */
export const SlashTextarea = function SlashTextarea({
  value,
  onChange,
  variables,
  rows,
  onPickerStateChange,
  handleRef,
  textareaRef,
}: {
  value: string;
  onChange: (v: string) => void;
  variables: CatalogVariable[];
  rows: number;
  onPickerStateChange: (state: PickerState) => void;
  handleRef?: React.MutableRefObject<SlashTextareaHandle | null>;
  textareaRef?: React.MutableRefObject<HTMLTextAreaElement | null>;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const taRef = textareaRef ?? localRef;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [startIndex, setStartIndex] = useState(-1);
  const [highlightedIdx, setHighlightedIdx] = useState(0);

  const filtered = useMemo(
    () => filterVariables(variables, query),
    [variables, query],
  );

  // Reset highlighted gdy filtered się zmienia.
  useEffect(() => {
    setHighlightedIdx(0);
  }, [query]);

  // Publikuj stan picker'a do parenta — ten renderuje UI w prawej kolumnie.
  useEffect(() => {
    onPickerStateChange({ open, query, filtered, highlightedIdx });
  }, [open, query, filtered, highlightedIdx, onPickerStateChange]);

  function detectPicker(newValue: string, cursor: number) {
    let i = cursor - 1;
    while (i >= 0) {
      const ch = newValue[i];
      if (ch === "/") {
        const before = i === 0 ? "" : newValue[i - 1];
        if (i === 0 || /\s/.test(before)) {
          setOpen(true);
          setStartIndex(i);
          setQuery(newValue.slice(i + 1, cursor));
          return;
        }
      }
      if (/\s/.test(newValue[i])) break;
      i--;
    }
    setOpen(false);
    setStartIndex(-1);
    setQuery("");
  }

  function handleChange(newValue: string) {
    onChange(newValue);
    const ta = taRef.current;
    if (!ta) return;
    detectPicker(newValue, ta.selectionStart);
  }

  function insertVariable(v: CatalogVariable) {
    const ta = taRef.current;
    if (!ta || startIndex < 0) return;
    const cursor = ta.selectionStart;
    const before = value.slice(0, startIndex);
    const after = value.slice(cursor);
    const insertion = `{{${v.key}}}`;
    const newValue = before + insertion + after;
    onChange(newValue);
    setOpen(false);
    setStartIndex(-1);
    setQuery("");
    setTimeout(() => {
      const newPos = before.length + insertion.length;
      ta.focus();
      ta.setSelectionRange(newPos, newPos);
    }, 0);
  }

  function closePicker() {
    setOpen(false);
    setStartIndex(-1);
    setQuery("");
    taRef.current?.focus();
  }

  function insertLiteral(text: string) {
    const ta = taRef.current;
    if (!ta || startIndex < 0) return;
    const cursor = ta.selectionStart;
    const before = value.slice(0, startIndex);
    const after = value.slice(cursor);
    const newValue = before + text + after;
    onChange(newValue);
    setOpen(false);
    setStartIndex(-1);
    setQuery("");
    setTimeout(() => {
      const newPos = before.length + text.length;
      ta.focus();
      ta.setSelectionRange(newPos, newPos);
    }, 0);
  }

  // Imperative handle do parenta — używane przez kliknięcie myszą w pickerze.
  if (handleRef) {
    handleRef.current = {
      insertVariable,
      insertLiteral,
      closePicker,
      setHighlightedIdx,
    };
  }

  function wrapSelection(beforeStr: string, afterStr: string, placeholder = "") {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = value.slice(start, end);
    const text = sel || placeholder;
    const newValue =
      value.slice(0, start) + beforeStr + text + afterStr + value.slice(end);
    onChange(newValue);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(
        start + beforeStr.length,
        start + beforeStr.length + text.length,
      );
    }, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Keyboard shortcuts dla formatowania (Ctrl/Cmd + B/I)
    if ((e.ctrlKey || e.metaKey) && !open) {
      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        wrapSelection("**", "**", "tekst");
        return;
      }
      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        wrapSelection("*", "*", "tekst");
        return;
      }
    }
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closePicker();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIdx((i) => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      if (filtered[highlightedIdx]) {
        e.preventDefault();
        insertVariable(filtered[highlightedIdx]);
      }
      return;
    }
  }

  return (
    <Textarea
      ref={taRef as React.Ref<HTMLTextAreaElement>}
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      onKeyDown={handleKeyDown}
      rows={rows}
      className="font-mono text-sm"
    />
  );
};
