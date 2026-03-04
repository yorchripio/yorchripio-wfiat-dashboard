"use client";

import { useRef, useEffect, useState, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type RoleOption = "VIEWER" | "TRADER";

const ROLE_LABELS: Record<RoleOption, string> = {
  VIEWER: "Viewer",
  TRADER: "Trader",
};

interface RoleSelectProps {
  value: RoleOption;
  onChange: (value: RoleOption) => void;
  disabled?: boolean;
  className?: string;
  /** Si true, trigger más chico para tabla */
  compact?: boolean;
}

export function RoleSelect({
  value,
  onChange,
  disabled = false,
  className,
  compact = false,
}: RoleSelectProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const updatePosition = (): void => {
    const trigger = containerRef.current?.querySelector("button");
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      setDropdownRect({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  };

  useLayoutEffect(() => {
    if (open && containerRef.current) {
      updatePosition();
    } else {
      setDropdownRect(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (target.closest("[data-role-select-dropdown]")) return;
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    const handleScrollOrResize = (): void => updatePosition();
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [open]);

  const options: RoleOption[] = ["VIEWER", "TRADER"];

  const dropdownContent =
    open &&
    dropdownRect &&
    typeof document !== "undefined" &&
    createPortal(
      <ul
        data-role-select-dropdown
        role="listbox"
        className="fixed z-[100] rounded-lg border border-[#010103]/15 bg-[#FFFFFF] shadow-lg py-1 min-w-[140px]"
        style={{
          top: dropdownRect.top,
          left: dropdownRect.left,
          width: Math.max(dropdownRect.width, 140),
        }}
      >
        {options.map((opt) => (
          <li key={opt} role="option" aria-selected={opt === value}>
            <button
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2.5 text-left text-[#010103] font-medium text-base",
                "hover:bg-[#010103]/5 focus:bg-[#010103]/5 focus:outline-none",
                opt === value && "bg-[#006bb7]/10 text-[#006bb7]"
              )}
            >
              <span>{ROLE_LABELS[opt]}</span>
            </button>
          </li>
        ))}
      </ul>,
      document.body
    );

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Seleccionar rol"
        className={cn(
          "flex items-center gap-2 w-full rounded-lg border border-[#010103]/15 bg-[#FFFFFF] pl-3 pr-9 py-2 text-left",
          "hover:border-[#010103]/25 focus:outline-none focus:ring-2 focus:ring-[#5f6e78] focus:ring-offset-0",
          "disabled:opacity-50 disabled:pointer-events-none",
          compact ? "min-h-[36px] text-sm" : "min-h-[44px] font-medium text-base"
        )}
      >
        <span className="flex-1 min-w-0 text-[#010103] truncate text-left">
          {ROLE_LABELS[value]}
        </span>
        <ChevronDown
          className={cn(
            "absolute right-3 flex-shrink-0 text-[#010103]/50 transition-transform",
            compact ? "size-4" : "size-5",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {dropdownContent}
    </div>
  );
}
