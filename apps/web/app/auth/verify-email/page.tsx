import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const result = await verifyEmail(searchParams.token);

  return (
    <AuthShell
      title={result.ok ? "Email verified" : "Verification failed"}
      subtitle={
        result.ok
          ? "Your email is confirmed and your AlphaSignal account is ready."
          : result.message
      }
      footer={
        <Link className="text-accent" href="/auth/login">
          Return to sign in
        </Link>
      }
    >
      <div
        className={`rounded border px-3 py-2 text-sm ${
          result.ok
            ? "border-long/40 bg-long/10 text-long"
            : "border-short/40 bg-short/10 text-short"
        }`}
      >
        {result.ok ? "Verification complete." : result.message}
      </div>
    </AuthShell>
  );
}

async function verifyEmail(token: string | undefined): Promise<{ ok: boolean; message: string }> {
  if (!token) {
    return { ok: false, message: "Verification token is missing." };
  }

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/auth/verify-email?token=${encodeURIComponent(token)}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    return { ok: false, message: "The verification link is invalid or expired." };
  }

  return { ok: true, message: "Email verified." };
}
