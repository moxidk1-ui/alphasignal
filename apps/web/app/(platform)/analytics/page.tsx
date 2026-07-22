import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { ProviderAnalyticsDashboard } from "@/components/analytics/ProviderAnalyticsDashboard";
import { authOptions } from "@/lib/auth";

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "PROVIDER") {
    redirect("/dashboard");
  }
  return <ProviderAnalyticsDashboard />;
}
