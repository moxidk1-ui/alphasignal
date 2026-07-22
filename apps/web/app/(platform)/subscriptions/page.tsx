import { SubscriptionManager } from "@/components/billing/SubscriptionManager";

export default function SubscriptionsPage({ searchParams }: { searchParams: { checkout?: string } }) {
  return <SubscriptionManager checkoutResult={searchParams.checkout} />;
}
