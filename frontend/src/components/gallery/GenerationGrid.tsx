import { useEffect, useRef } from "react";
import type { GenerationSummary } from "@/api/types";
import { GenerationCard } from "@/components/gallery/GenerationCard";

interface GenerationGridProps {
  items: GenerationSummary[];
  onOpen: (id: string) => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

/** Thumbnail grid with scroll-triggered pagination (SPEC.md § 11.2, § 7.2). */
export function GenerationGrid({
  items,
  onOpen,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: GenerationGridProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasNextPage) return;
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        onLoadMore();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, onLoadMore]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {items.map((generation) => (
          <GenerationCard key={generation.id} generation={generation} onOpen={onOpen} />
        ))}
      </div>
      {hasNextPage ? <div ref={sentinelRef} className="h-1" aria-hidden="true" /> : null}
      {isFetchingNextPage ? (
        <p className="text-center text-sm text-ink-muted">Caricamento altre immagini...</p>
      ) : null}
    </div>
  );
}
