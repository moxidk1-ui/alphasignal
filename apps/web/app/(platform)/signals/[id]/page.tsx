import { SignalPageView } from "@/components/signals/SignalPageView";

export default function SignalPage({ params }: { params: { id: string } }) {
  return <SignalPageView id={params.id} />;
}
