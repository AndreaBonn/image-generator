import { BeforeAfterSlider } from "@/components/common/BeforeAfterSlider";
import { ResultCardActions } from "@/components/create/ResultArea";

interface ImproveResultCardProps {
  generationId: string;
  beforeUrl: string;
  /** True for "Rimuovi lo sfondo" results: the after image is a transparent PNG. */
  transparentAfter?: boolean;
}

/** One Migliora result: before/after comparison + download/favorite/rerun. */
export function ImproveResultCard({ generationId, beforeUrl, transparentAfter = false }: ImproveResultCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-paper-2 p-2">
      <BeforeAfterSlider
        beforeUrl={beforeUrl}
        afterUrl={`/api/v1/generations/${generationId}/image`}
        sliderId={`before-after-${generationId}`}
        transparentAfter={transparentAfter}
      />
      <ResultCardActions generationId={generationId} />
    </div>
  );
}
