import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { SignalCreateForm } from "@/components/signals/SignalCreateForm";
import { authOptions } from "@/lib/auth";

export default async function CreateSignalPage({ searchParams }: { searchParams: { from?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["PROVIDER", "ADMIN"].includes(session.user.role)) {
    redirect("/dashboard");
  }

  return <SignalCreateForm {...(searchParams.from ? { fromSignalId: searchParams.from } : {})} />;
}
