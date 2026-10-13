import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchGenerations, thumbnailUrl } from "@/api/queries";

const RECENT_COUNT = 4;

/**
 * Empty state of Crea's result area (C14): the latest images and a way to the
 * Galleria, instead of a sentence taking the best spot on the page.
 */
export function RecentImages() {
  const recentQuery = useQuery({
    queryKey: ["generations", "recent"],
    queryFn: () => fetchGenerations({ perPage: RECENT_COUNT }),
  });
  const items = recentQuery.data?.items ?? [];

  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed border-border bg-paper-2 p-4">
      <p className="text-sm text-ink">Scrivi cosa vuoi vedere e premi Genera.</p>
      {items.length > 0 ? (
        <>
          <p className="text-xs font-semibold text-ink-muted">Le tue ultime immagini</p>
          <div className="grid grid-cols-2 gap-2">
            {items.map((item) => (
              <img
                key={item.id}
                src={item.thumbnail_url ?? thumbnailUrl(item.id)}
                alt={item.prompt || "Immagine generata"}
                width={item.width}
                height={item.height}
                loading="lazy"
                className="aspect-[4/3] w-full rounded-md object-cover"
              />
            ))}
          </div>
          <Link to="/galleria" className="min-h-11 w-fit content-center text-sm text-accent-text underline">
            Apri la Galleria
          </Link>
        </>
      ) : null}
    </div>
  );
}
