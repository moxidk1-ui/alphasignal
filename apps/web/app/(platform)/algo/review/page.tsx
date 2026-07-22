import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { AlgoReviewPanel } from "@/components/algo/AlgoReviewPanel";
import { authOptions } from "@/lib/auth";

export default async function AlgoReviewPage() {
  const session = await getServerSession(authOptions);
  if (!session || !["PROVIDER", "ADMIN"].includes(session.user.role)) redirect("/dashboard");
  return <AlgoReviewPanel />;
}
