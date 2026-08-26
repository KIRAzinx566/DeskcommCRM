"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { UpdateMeetingInput } from "@/lib/schemas/meetings";
import type { Meeting } from "@/lib/types/meetings";

export function useUpdateMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateMeetingInput }) =>
      apiClient.patch<{ data: Meeting }>(`/api/v1/meetings/${id}`, patch),
    onError: showApiError,
    onSettled: () => qc.invalidateQueries({ queryKey: ["meetings"] }),
  });
}
