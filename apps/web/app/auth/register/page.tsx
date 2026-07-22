import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <AuthShell
      title="Create account"
      subtitle="Start with the free plan and upgrade when you need provider alerts or publishing tools."
      footer={
        <Link className="text-accent" href="/auth/login">
          Sign in to an existing account
        </Link>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
