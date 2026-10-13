/**
 * Backend contract types, isolated here on purpose (SPEC.md § 7.2-7.3).
 * The backend is being written in parallel: if the exact shape drifts
 * once it lands, only this file (and client.ts's parsing) should need
 * to change.
 *
 * Barrel over src/api/types/*: split by domain so each file stays well
 * under the 300-line limit, re-exported here so existing imports of
 * "@/api/types" keep working unchanged.
 */

export * from "@/api/types/tasks";
export * from "@/api/types/styles";
export * from "@/api/types/generations";
export * from "@/api/types/jobs";
export * from "@/api/types/uploads";
export * from "@/api/types/models";
export * from "@/api/types/system";
export * from "@/api/types/examples";
export * from "@/api/types/assets";
export * from "@/api/types/common";
