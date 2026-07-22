import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/classes";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "icon";
  children: ReactNode;
}

export function Button({ variant = "secondary", size = "md", className, children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded border text-sm font-medium transition duration-200 disabled:opacity-50",
        variant === "primary" && "border-accent bg-accent text-white hover:bg-blue-500",
        variant === "secondary" && "border-border bg-background-elevated text-text-primary hover:border-slate-500",
        variant === "danger" && "border-short/40 bg-short/10 text-short hover:bg-short/20",
        variant === "ghost" && "border-transparent bg-transparent text-text-muted hover:bg-background-elevated hover:text-text-primary",
        size === "sm" && "h-8 px-3",
        size === "md" && "h-10 px-4",
        size === "icon" && "h-9 w-9",
        className,
      )}
    >
      {children}
    </button>
  );
}
