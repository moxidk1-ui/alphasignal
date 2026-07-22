import { AlertCircle, Inbox, RefreshCcw } from "lucide-react";
import { Button } from "./Button";

export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-background-elevated ${className ?? ""}`} />;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded border border-short/30 bg-short/10 px-4 py-3 text-sm text-short">
      <span className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {message}
      </span>
      {retry ? (
        <Button type="button" size="sm" variant="ghost" onClick={retry} aria-label="Retry">
          <RefreshCcw className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-4 border border-dashed border-border px-6 py-10 text-center">
      <Inbox className="h-9 w-9 text-text-muted" />
      <p className="text-sm text-text-muted">{title}</p>
      {action}
    </div>
  );
}
