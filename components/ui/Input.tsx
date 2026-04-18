"use client";

import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface FieldWrapperProps {
  id: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function FieldWrapper({
  id,
  label,
  hint,
  error,
  required,
  children,
  className,
}: FieldWrapperProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-[var(--text-muted)]"
        >
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-red-500" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-[var(--text-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
  fieldClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    id,
    label,
    hint,
    error,
    leftIcon,
    rightSlot,
    required,
    className,
    fieldClassName,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error
    ? `${inputId}-error`
    : hint
      ? `${inputId}-hint`
      : undefined;

  return (
    <FieldWrapper
      id={inputId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={fieldClassName}
    >
      <div className="relative">
        {leftIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
            {leftIcon}
          </span>
        )}
        <input
          id={inputId}
          ref={ref}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "w-full px-4 py-3 bg-[var(--bg-main)] border rounded-xl text-sm text-[var(--text-main)]",
            "placeholder:text-[var(--text-muted)]",
            "focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]",
            "disabled:opacity-60 disabled:cursor-not-allowed",
            error
              ? "border-red-500/50 focus:ring-red-500/30 focus:border-red-500"
              : "border-[var(--border-subtle)]",
            leftIcon && "pl-10",
            rightSlot && "pr-11",
            className,
          )}
          {...rest}
        />
        {rightSlot && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2">
            {rightSlot}
          </span>
        )}
      </div>
    </FieldWrapper>
  );
});

type PasswordInputProps = Omit<InputProps, "type" | "rightSlot">;

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(props, ref) {
    const [show, setShow] = useState(false);

    return (
      <Input
        {...props}
        ref={ref}
        type={show ? "text" : "password"}
        rightSlot={
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Ukryj hasło" : "Pokaż hasło"}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg transition-colors"
          >
            {show ? (
              <EyeOff className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Eye className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        }
      />
    );
  },
);

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  fieldClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { id, label, hint, error, required, className, fieldClassName, ...rest },
    ref,
  ) {
    const autoId = useId();
    const inputId = id ?? autoId;
    const describedBy = error
      ? `${inputId}-error`
      : hint
        ? `${inputId}-hint`
        : undefined;

    return (
      <FieldWrapper
        id={inputId}
        label={label}
        hint={hint}
        error={error}
        required={required}
        className={fieldClassName}
      >
        <textarea
          id={inputId}
          ref={ref}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "w-full px-4 py-3 bg-[var(--bg-main)] border rounded-xl text-sm text-[var(--text-main)]",
            "placeholder:text-[var(--text-muted)] resize-none",
            "focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]",
            "disabled:opacity-60 disabled:cursor-not-allowed",
            error
              ? "border-red-500/50 focus:ring-red-500/30 focus:border-red-500"
              : "border-[var(--border-subtle)]",
            className,
          )}
          {...rest}
        />
      </FieldWrapper>
    );
  },
);

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  description?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ id, label, description, className, ...rest }, ref) {
    const autoId = useId();
    const inputId = id ?? autoId;
    return (
      <label
        htmlFor={inputId}
        className="flex items-start gap-3 cursor-pointer select-none"
      >
        <input
          id={inputId}
          ref={ref}
          type="checkbox"
          className={cn(
            "mt-1 w-4 h-4 rounded border-[var(--border-subtle)] bg-[var(--bg-main)]",
            "text-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/50 cursor-pointer",
            className,
          )}
          {...rest}
        />
        {(label || description) && (
          <span className="flex-1">
            {label && (
              <span className="block text-sm font-medium text-[var(--text-main)]">
                {label}
              </span>
            )}
            {description && (
              <span className="block text-xs text-[var(--text-muted)] mt-1">
                {description}
              </span>
            )}
          </span>
        )}
      </label>
    );
  },
);
