import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetPresenceForTests,
  getActiveEditors,
  getPresenceSize,
  recordDisconnect,
  recordHeartbeat,
  PRESENCE_TIMEOUT_MS,
} from "@/lib/editor-presence";

describe("editor-presence", () => {
  beforeEach(() => {
    __resetPresenceForTests();
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    __resetPresenceForTests();
  });

  it("records a heartbeat and exposes the editor as active", () => {
    const result = recordHeartbeat({
      serviceId: "svc-1",
      byUserId: "user-a",
      byUserEmail: "a@example.com",
      byUserName: "Anna",
      byUserRole: "sales",
    });
    expect(result.isNew).toBe(true);

    const editors = getActiveEditors("svc-1");
    expect(editors).toHaveLength(1);
    expect(editors[0].byUserName).toBe("Anna");
    expect(editors[0].byUserRole).toBe("sales");
    expect(getPresenceSize()).toBe(1);
  });

  it("treats a repeat heartbeat from the same user as not-new", () => {
    recordHeartbeat({
      serviceId: "svc-1",
      byUserId: "user-a",
      byUserEmail: "a@example.com",
      byUserName: "Anna",
      byUserRole: "sales",
    });
    const second = recordHeartbeat({
      serviceId: "svc-1",
      byUserId: "user-a",
      byUserEmail: "a@example.com",
      byUserName: "Anna",
      byUserRole: "sales",
    });
    expect(second.isNew).toBe(false);
  });

  it("filters stale entries out of getActiveEditors after PRESENCE_TIMEOUT_MS", () => {
    recordHeartbeat({
      serviceId: "svc-1",
      byUserId: "user-a",
      byUserEmail: "a@example.com",
      byUserName: "Anna",
      byUserRole: "sales",
    });
    expect(getActiveEditors("svc-1")).toHaveLength(1);

    vi.advanceTimersByTime(PRESENCE_TIMEOUT_MS + 1_000);
    expect(getActiveEditors("svc-1")).toHaveLength(0);
  });

  it("recordDisconnect clears entry and returns last presence", () => {
    recordHeartbeat({
      serviceId: "svc-1",
      byUserId: "user-a",
      byUserEmail: "a@example.com",
      byUserName: "Anna",
      byUserRole: "sales",
    });
    const removed = recordDisconnect("svc-1", "user-a");
    expect(removed?.byUserName).toBe("Anna");
    expect(getActiveEditors("svc-1")).toHaveLength(0);
    expect(getPresenceSize()).toBe(0);
  });

  it("recordDisconnect returns null when nothing recorded", () => {
    expect(recordDisconnect("svc-1", "ghost")).toBeNull();
  });

  it("scopes editors per service id", () => {
    recordHeartbeat({
      serviceId: "svc-1",
      byUserId: "user-a",
      byUserEmail: "a@example.com",
      byUserName: "Anna",
      byUserRole: "sales",
    });
    recordHeartbeat({
      serviceId: "svc-2",
      byUserId: "user-a",
      byUserEmail: "a@example.com",
      byUserName: "Anna",
      byUserRole: "sales",
    });
    expect(getActiveEditors("svc-1")).toHaveLength(1);
    expect(getActiveEditors("svc-2")).toHaveLength(1);
    expect(getPresenceSize()).toBe(2);
  });
});
