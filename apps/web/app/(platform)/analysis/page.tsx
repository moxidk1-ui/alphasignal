import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { AnalysisWorkbench } from "@/components/analysis/AnalysisWorkbench";
import { authOptions } from "@/lib/auth";

export default async function AnalysisPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.plan === "FREE") {
    redirect("/subscriptions");
  }
  return <AnalysisWorkbench />;
}
