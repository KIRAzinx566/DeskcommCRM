import { describe, it, expect } from "vitest";
import { createMeetingSchema, updateMeetingSchema, listMeetingsQuerySchema } from "./meetings";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("createMeetingSchema", () => {
  it("accepts a minimal valid payload", () => {
    const r = createMeetingSchema.safeParse({
      lead_id: UUID,
      starts_at: "2026-09-01T14:00:00.000Z",
    });
    expect(r.success).toBe(true);
  });

  it("defaults modality to online", () => {
    const r = createMeetingSchema.safeParse({
      lead_id: UUID,
      starts_at: "2026-09-01T14:00:00.000Z",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.modality).toBe("online");
  });

  it("rejects non-uuid lead_id", () => {
    const r = createMeetingSchema.safeParse({
      lead_id: "not-uuid",
      starts_at: "2026-09-01T14:00:00.000Z",
    });
    expect(r.success).toBe(false);
  });

  it("rejects ends_at before starts_at", () => {
    const r = createMeetingSchema.safeParse({
      lead_id: UUID,
      starts_at: "2026-09-01T14:00:00.000Z",
      ends_at: "2026-09-01T13:00:00.000Z",
    });
    expect(r.success).toBe(false);
  });

  it("accepts ends_at after starts_at", () => {
    const r = createMeetingSchema.safeParse({
      lead_id: UUID,
      starts_at: "2026-09-01T14:00:00.000Z",
      ends_at: "2026-09-01T15:00:00.000Z",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a starts_at that isn't a real date", () => {
    const r = createMeetingSchema.safeParse({
      lead_id: UUID,
      starts_at: "not-a-date-but-10-chars",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown modality", () => {
    const r = createMeetingSchema.safeParse({
      lead_id: UUID,
      starts_at: "2026-09-01T14:00:00.000Z",
      modality: "teletransporte",
    });
    expect(r.success).toBe(false);
  });
});

describe("updateMeetingSchema", () => {
  it("accepts a partial status-only patch", () => {
    const r = updateMeetingSchema.safeParse({ status: "realizada" });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown status", () => {
    const r = updateMeetingSchema.safeParse({ status: "sumiu" });
    expect(r.success).toBe(false);
  });

  it("accepts an empty patch", () => {
    const r = updateMeetingSchema.safeParse({});
    expect(r.success).toBe(true);
  });
});

describe("listMeetingsQuerySchema", () => {
  it("accepts an empty query", () => {
    const r = listMeetingsQuerySchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("coerces limit from a query string", () => {
    const r = listMeetingsQuerySchema.safeParse({ limit: "25" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(25);
  });

  it("rejects limit above 100", () => {
    const r = listMeetingsQuerySchema.safeParse({ limit: "500" });
    expect(r.success).toBe(false);
  });
});
