"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { MeetingStatus } from "@/lib/schemas/meetings";
import type { Meeting } from "@/lib/types/meetings";

interface ListResponse {
  data: Meeting[];
  meta?: { cursor?: string; has_more?: boolean };
}

export interface MeetingListFilters {
  lead_id?: string;
  status?: MeetingStatus;
  from?: string;
  to?: string;
  limit?: number;
}

export function useMeetingList(filters: MeetingListFilters) {
  return useInfiniteQuery({
    queryKey: ["meetings", filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams();
      if (filters.lead_id) qs.set("lead_id", filters.lead_id);
      if (filters.status) qs.set("status", filters.status);
      if (filters.from) qs.set("from", filters.from);
      if (filters.to) qs.set("to", filters.to);
      if (filters.limit) qs.set("limit", String(filters.limit));
      if (pageParam) qs.set("cursor", pageParam);
      try {
        return await apiClient.get<ListResponse>(`/api/v1/meetings?${qs.toString()}`);
      } catch (err) {
        showApiError(err);
        throw err;
      }
    },
    getNextPageParam: (lastPage) => (lastPage.meta?.has_more ? lastPage.meta.cursor : undefined),
  });
}
