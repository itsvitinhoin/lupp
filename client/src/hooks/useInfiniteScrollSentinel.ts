import React from "react";

/**
 * Infinite scroll inside a fixed-height container: observe a sentinel element
 * placed after the last row and pull the next page when it nears the
 * viewport of `scrollRef` (with margin, so loading starts before the edge).
 */
export function useInfiniteScrollSentinel({
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  itemCount,
  scrollRef,
  sentinelRef,
}: {
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  itemCount: number;
  scrollRef: React.RefObject<HTMLElement | null>;
  sentinelRef: React.RefObject<HTMLElement | null>;
}) {
  React.useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: scrollRef.current, rootMargin: "160px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // itemCount re-arms the observer after each page lands.
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, itemCount, scrollRef, sentinelRef]);
}
