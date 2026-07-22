"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await signIn("credentials", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      redirect: false,
      callbackUrl,
    });

    setPending(false);

    if (!response?.ok) {
      setError("Invalid email or password.");
      return;
    }

    router.push(response.url ?? callbackUrl);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="text-sm text-text-muted">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-2 w-full rounded border border-border bg-background-base px-3 py-2 text-text-primary outline-none transition focus:border-accent"
        />
      </label>
      <label className="block">
        <span className="text-sm text-text-muted">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-2 w-full rounded border border-border bg-background-base px-3 py-2 text-text-primary outline-none transition focus:border-accent"
        />
      </label>
      {error ? (
        <div className="rounded border border-short/40 bg-short/10 px-3 py-2 text-sm text-short">
          {error}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-accent px-4 py-2 font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Signing in" : "Sign in"}
      </button>
      <button
        type="button"
        onClick={() => void signIn("google", { callbackUrl })}
        className="w-full rounded border border-border bg-background-elevated px-4 py-2 font-medium text-text-primary transition hover:border-accent"
      >
        Continue with Google
      </button>
      <p className="text-center text-sm text-text-muted">
          New here?{" "}
        <Link className="text-accent" href="/auth/register">
          Create an account
        </Link>
      </p>
    </form>
  );
}
