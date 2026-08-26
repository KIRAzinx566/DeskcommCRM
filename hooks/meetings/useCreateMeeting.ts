"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { CreateMeetingInput } from "@/lib/schemas/meetings";
import type { Meeting } from "@/lib/types/meetings";

export function useCreateMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateMeetingInput) =>
      apiClient.post<{ data: Meeting }>("/api/v1/meetings", input),
    onError: showApiError,
    onSettled: () => qc.invalidateQueries({ queryKey: ["meetings"] }),
  });
}
