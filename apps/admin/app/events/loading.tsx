import { Card, Skeleton, SkeletonTable } from "@/components/ui";

/** Same heading and row shape as the real events page, so nothing shifts. */
export default function EventsLoading() {
  return (
    <div className="space-y-6">
      <span className="sr-only">Loading events</span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Card className="overflow-hidden">
        <SkeletonTable rows={6} />
      </Card>
    </div>
  );
}
