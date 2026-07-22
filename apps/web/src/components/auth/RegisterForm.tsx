"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        name: String(form.get("name") ?? ""),
      }),
      credentials: "include",
    });

    if (!response.ok) {
      setPending(false);
      setError(response.status === 409 ? "An account with this email already exists." : "Registration failed.");
      return;
    }

    const signInResponse = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/dashboard",
    });

    setPending(false);

    if (!signInResponse?.ok) {
      setError("Account created, but automatic sign-in failed.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="text-sm text-text-muted">Name</span>
        <input
          name="name"
          type="text"
          autoComplete="name"
          required
          className="mt-2 w-full rounded border border-border bg-background-base px-3 py-2 text-text-primary outline-none transition focus:border-accent"
        />
      </label>
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
          autoComplete="new-password"
          required
          minLength={12}
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
        {pending ? "Creating account" : "Create account"}
      </button>
      <p className="text-center text-sm text-text-muted">
        Already registered?{" "}
        <Link className="text-accent" href="/auth/login">
          Sign in
        </Link>
      </p>
    </form>
  );
}
