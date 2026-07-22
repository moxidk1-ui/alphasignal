import { ProviderProfile } from "@/components/providers/ProviderProfile";

export default function ProviderPage({ params }: { params: { id: string } }) {
  return <ProviderProfile id={params.id} />;
}
