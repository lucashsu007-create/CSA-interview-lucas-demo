import { Skeleton, SkeletonCard } from "@/components/ui";

/**
 * The dashboard's skeleton mirrors the dashboard: heading, then a wide lead
 * panel, two half-width panels, and a second wide panel. Generic bars would be
 * a spinner with extra steps and would guarantee the layout jumps on arrival.
 *
 * It lives in the `(dashboard)` route group rather than at the app root so it
 * is the boundary for THIS page only. At the root it also stood in for
 * `/events`, which meant a table route briefly rendering a dashboard shape —
 * the exact layout jump a skeleton exists to prevent.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Loading the dashboard</span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <SkeletonCard rows={4} />
      <div className="grid gap-6 md:grid-cols-2">
        <SkeletonCard rows={2} />
        <SkeletonCard rows={2} />
      </div>
      <SkeletonCard rows={3} />
    </div>
  );
}
