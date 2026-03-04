"use client";

import { useRef, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { TokenLogo } from "@/components/ui/TokenLogo";
import { cn } from "@/lib/utils";

export interface TokenOption {
  id: string;
  label: string;
  available: boolean;
}

interface TokenSelectProps {
  value: string;
  options: TokenOption[];
  onChange: (value: string) => void;
  className?: string;
  triggerClassName?: string;
}

export function TokenSelect({
  value,
  options,
  onChange,
  className,
  triggerClassName,
}: TokenSelectProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const selected = options.find((o) => o.id === value);
  const availableOptions = options.filter((o) => o.available);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Seleccionar token"
        className={cn(
          "flex items-center gap-2 min-h-[44px] w-full rounded-lg border border-[#010103]/15 bg-[#FFFFFF] pl-3 pr-9 py-2 text-left",
          "hover:border-[#010103]/25 focus:outline-none focus:ring-2 focus:ring-[#5f6e78] focus:ring-offset-0",
          triggerClassName
        )}
      >
        <TokenLogo tokenId={value} size={28} className="flex-shrink-0" />
        <span className="flex-1 min-w-0 text-[#010103] font-medium text-base truncate">
          {selected?.label ?? value}
        </span>
        <ChevronDown
          className={cn("absolute right-3 size-5 text-[#010103]/50 flex-shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-[#010103]/15 bg-[#FFFFFF] shadow-lg py-1 min-w-[180px] max-h-[280px] overflow-auto"
        >
          {availableOptions.map((opt) => (
            <li key={opt.id} role="option" aria-selected={opt.id === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(opt.id);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2.5 text-left text-[#010103] font-medium text-base",
                  "hover:bg-[#010103]/5 focus:bg-[#010103]/5 focus:outline-none",
                  opt.id === value && "bg-[#006bb7]/10 text-[#006bb7]"
                )}
              >
                <TokenLogo tokenId={opt.id} size={24} className="flex-shrink-0" />
                <span>{opt.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
