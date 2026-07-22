import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string };
}) {
  return (
    <AuthShell
      title="Sign in"
      subtitle="Access your live signal feed, provider tools, and account settings."
      footer={
        <>
          Need verification?{" "}
          <Link className="text-accent" href="/auth/verify-email">
            Open verification
          </Link>
        </>
      }
    >
      <LoginForm callbackUrl={searchParams.callbackUrl ?? "/dashboard"} />
    </AuthShell>
  );
}
