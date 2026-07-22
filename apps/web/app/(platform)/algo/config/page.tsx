import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { AlgoConfigForm } from "@/components/algo/AlgoConfigForm";
import { authOptions } from "@/lib/auth";

export default async function AlgoConfigPage() {
  const session = await getServerSession(authOptions);
  if (!session || !["PROVIDER", "ADMIN"].includes(session.user.role)) redirect("/dashboard");
  return <AlgoConfigForm />;
}
