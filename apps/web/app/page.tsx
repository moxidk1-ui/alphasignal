import { getServerSession } from "next-auth";
import { Activity, BellRing, Bot, Check, Radio, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { authOptions } from "@/lib/auth";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  return (
    <main className="bg-background-base text-text-primary">
      <section className="relative flex min-h-[min(78vh,720px)] flex-col overflow-hidden border-b border-border">
        <Image
          src="/hero-trading-desk.jpg"
          alt="Trading workstation with active multi-market candlestick charts"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,10,15,0.96)_0%,rgba(8,10,15,0.82)_38%,rgba(8,10,15,0.28)_76%,rgba(8,10,15,0.6)_100%)]" />
        <header className="relative z-10 mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-5 md:px-8">
          <Link href="/" className="flex items-center gap-3 font-semibold">
            <span className="flex h-9 w-9 items-center justify-center rounded bg-accent font-mono text-sm text-white">AS</span>
            AlphaSignal
          </Link>
          <div className="flex shrink-0 items-center gap-2 text-sm">
            {session ? (
              <Link href="/dashboard" className="whitespace-nowrap rounded border border-accent bg-accent px-3 py-2 font-medium text-white sm:px-4">Dashboard</Link>
            ) : (
              <>
                <Link href="/auth/login" className="whitespace-nowrap px-2 py-2 text-text-muted transition hover:text-text-primary">Sign in</Link>
                <Link href="/auth/register" className="whitespace-nowrap rounded border border-accent bg-accent px-3 py-2 font-medium text-white sm:px-4">Create account</Link>
              </>
            )}
          </div>
        </header>
        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 items-center px-5 pb-14 pt-12 md:px-8">
          <div className="max-w-xl">
            <p className="mb-5 flex items-center gap-2 text-[11px] font-medium uppercase text-accent sm:text-xs">
              <Radio className="h-4 w-4" /> Multi-market signals in real time
            </p>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">AlphaSignal</h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-300">
              Trade structured setups across stocks, forex, crypto, and futures with live provider signals,
              configurable algorithmic detection, and AI-assisted analysis.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={session ? "/dashboard" : "/auth/register"} className="rounded border border-accent bg-accent px-5 py-3 text-sm font-medium text-white">
                {session ? "Open dashboard" : "Start free"}
              </Link>
              <Link href="#plans" className="rounded border border-border bg-background-surface/80 px-5 py-3 text-sm font-medium">
                View plans
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-background-surface">
        <div className="mx-auto grid max-w-7xl gap-px bg-border md:grid-cols-3">
          <Capability icon={Bot} title="Algo engine" text="ICT, Wyckoff, momentum, and price action setups with provider approval control." />
          <Capability icon={Activity} title="AI hybrid" text="Indicator-aware analysis returns structured levels ready for provider review." />
          <Capability icon={BellRing} title="Live delivery" text="In-app, email, and Telegram delivery for every subscribed signal lifecycle." />
        </div>
      </section>

      <section id="plans" className="mx-auto max-w-7xl px-5 py-14 md:px-8">
        <div className="mb-8 max-w-lg">
          <h2 className="text-2xl font-semibold">Plans</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">Start with market access, upgrade for live delivery and provider operations.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Pricing name="Free" price="$0" items={["5 signals per day", "Email alerts", "Follow 2 providers"]} href="/auth/register" />
          <Pricing name="Pro" price="$29" items={["Unlimited signal access", "AI analysis: 10/hour", "Live feed and Telegram", "Follow 10 providers"]} href="/auth/register" emphasized />
          <Pricing name="Provider" price="$79" items={["Publish all signal modes", "Configurable algo engine", "AI analysis: 30/hour", "Provider analytics"]} href="/auth/register" />
        </div>
      </section>

      <footer className="border-t border-border px-5 py-6 text-sm text-text-muted">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> AlphaSignal platform</span>
          <Link href="/auth/login" className="text-text-primary">Sign in</Link>
        </div>
      </footer>
    </main>
  );
}

function Capability({ icon: Icon, title, text }: { icon: typeof Activity; title: string; text: string }) {
  return (
    <div className="bg-background-surface px-6 py-7">
      <Icon className="mb-4 h-5 w-5 text-accent" />
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-text-muted">{text}</p>
    </div>
  );
}

function Pricing({ name, price, items, href, emphasized = false }: { name: string; price: string; items: string[]; href: string; emphasized?: boolean }) {
  return (
    <article className={`rounded border p-6 ${emphasized ? "border-accent bg-accent/5" : "border-border bg-background-surface"}`}>
      <h3 className="text-base font-medium">{name}</h3>
      <p className="numeric mt-4 text-3xl">{price}<span className="ml-1 font-sans text-sm text-text-muted">/ month</span></p>
      <ul className="mt-6 space-y-3 text-sm text-text-muted">
        {items.map((item) => <li key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-long" />{item}</li>)}
      </ul>
      <Link href={href} className={`mt-7 flex h-10 items-center justify-center rounded border text-sm font-medium ${emphasized ? "border-accent bg-accent text-white" : "border-border bg-background-elevated"}`}>
        Get started
      </Link>
    </article>
  );
}
