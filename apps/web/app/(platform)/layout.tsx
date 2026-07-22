import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { authOptions } from "@/lib/auth";

export default async function ProtectedPlatformLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/auth/login?callbackUrl=/dashboard");
  }

  return <PlatformShell>{children}</PlatformShell>;
}
