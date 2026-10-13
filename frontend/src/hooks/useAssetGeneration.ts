import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cancelAssetGeneration, fetchAssetGeneration, startAssetGeneration } from "@/api/queries";
import type { AssetGeneration, AssetGenerationStatus, AssetKind } from "@/api/types";

const ASSET_GENERATION_KEY = ["assets", "generation"];
const POLL_INTERVAL_MS = 1000;

/** The examples/previews run started from Impostazioni (I4): polled only while it runs. */
export function useAssetGeneration() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ASSET_GENERATION_KEY,
    queryFn: ({ signal }) => fetchAssetGeneration(signal),
    refetchInterval: (current) => (current.state.data?.status === "running" ? POLL_INTERVAL_MS : false),
  });
  useRefreshWhenFinished(query.data?.status);
  const store = (data: AssetGeneration) => queryClient.setQueryData(ASSET_GENERATION_KEY, data);
  const start = useMutation({ mutationFn: (kind: AssetKind) => startAssetGeneration(kind), onSuccess: store });
  const cancel = useMutation({ mutationFn: () => cancelAssetGeneration(), onSuccess: store });
  return { generation: query.data, start, cancel };
}

/** New examples and previews only show up once their lists are fetched again. */
function useRefreshWhenFinished(status: AssetGenerationStatus | undefined) {
  const queryClient = useQueryClient();
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current === "running" && status !== "running") {
      void queryClient.invalidateQueries({ queryKey: ["examples"] });
      void queryClient.invalidateQueries({ queryKey: ["styles"] });
    }
    previous.current = status;
  }, [status, queryClient]);
}
