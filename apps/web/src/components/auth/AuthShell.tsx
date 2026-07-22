import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background-base px-6 py-8 text-text-primary">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        <Link href="/" className="mb-8 font-mono text-sm text-text-muted">
          AlphaSignal
        </Link>
        <div className="rounded border border-border bg-background-surface p-6">
          <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-text-muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
        <div className="mt-5 text-center text-sm text-text-muted">{footer}</div>
      </section>
    </main>
  );
}
