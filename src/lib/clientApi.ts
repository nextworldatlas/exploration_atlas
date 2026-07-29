"use client";

// Client data layer: TanStack Query hooks over the REST API, with the
// optimistic mark-complete flow (spec §9): flip the cache (and therefore the
// map's feature-state) immediately, reconcile on the server response.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EarnedBadgeToast } from "./types";

export interface Mine {
  completed: number[];
  wishlist: number[];
}

export function useMine(slug: string) {
  return useQuery<Mine>({
    queryKey: ["mine", slug],
    queryFn: async () => (await fetch(`/api/systems/${slug}/mine`)).json(),
  });
}

export function useToggleExperience(
  slug: string,
  onBadges?: (badges: EarnedBadgeToast[]) => void
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: number; done: boolean }) => {
      const res = await fetch(`/api/components/${id}/experience`, {
        method: done ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: done ? undefined : JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`experience toggle failed: ${res.status}`);
      return res.json() as Promise<{ newBadges: EarnedBadgeToast[] }>;
    },
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: ["mine", slug] });
      const prev = qc.getQueryData<Mine>(["mine", slug]);
      qc.setQueryData<Mine>(["mine", slug], (old) => {
        const cur = old ?? { completed: [], wishlist: [] };
        return {
          ...cur,
          completed: done
            ? cur.completed.filter((c) => c !== id)
            : [...cur.completed, id],
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["mine", slug], ctx.prev);
    },
    onSuccess: (data) => {
      if (data.newBadges?.length) onBadges?.(data.newBadges);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["mine", slug] });
      qc.invalidateQueries({ queryKey: ["components", slug] });
      qc.invalidateQueries({ queryKey: ["progress", slug] });
    },
  });
}

export function useToggleWishlist(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, wishlisted }: { id: number; wishlisted: boolean }) => {
      await fetch(`/api/components/${id}/wishlist`, {
        method: wishlisted ? "DELETE" : "POST",
      });
    },
    onMutate: async ({ id, wishlisted }) => {
      await qc.cancelQueries({ queryKey: ["mine", slug] });
      qc.setQueryData<Mine>(["mine", slug], (old) => {
        const cur = old ?? { completed: [], wishlist: [] };
        return {
          ...cur,
          wishlist: wishlisted
            ? cur.wishlist.filter((c) => c !== id)
            : [...cur.wishlist, id],
        };
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["mine", slug] });
      qc.invalidateQueries({ queryKey: ["components", slug] });
    },
  });
}
