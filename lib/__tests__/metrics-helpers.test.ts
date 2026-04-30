import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetKcEventsPollStateForTests,
  __setKcEventsPollStateForTests,
  getKcEventsPollState,
} from "@/lib/security/kc-events-poll";
import {
  __resetQueueStatsForTests,
  __setQueueStatsForTests,
  getQueueStats,
} from "@/lib/permissions/queue";

describe("metrics helpers", () => {
  describe("getKcEventsPollState", () => {
    beforeEach(() => {
      __resetKcEventsPollStateForTests();
    });

    afterEach(() => {
      __resetKcEventsPollStateForTests();
    });

    it("returns null when poll has never been initialised", () => {
      expect(getKcEventsPollState()).toBeNull();
    });

    it("returns full state after a faked poll cycle", () => {
      const cursor = 1714492800000; // 2026-04-30T12:00:00Z
      const polledAt = 1714492805000; // +5s
      __setKcEventsPollStateForTests({
        cursorMs: cursor,
        lastPollAt: polledAt,
        lastEventCount: 7,
        errorCount: 1,
        running: false,
      });

      const state = getKcEventsPollState();
      expect(state).not.toBeNull();
      expect(state).toEqual({
        cursorMs: cursor,
        lastPollAt: polledAt,
        lastEventCount: 7,
        errorCount: 1,
        running: false,
      });
    });

    it("reflects running flag while a cycle is in flight", () => {
      __setKcEventsPollStateForTests({
        cursorMs: 100,
        lastEventCount: 0,
        errorCount: 0,
        running: true,
      });
      expect(getKcEventsPollState()?.running).toBe(true);
    });

    it("survives multiple updates (last write wins)", () => {
      __setKcEventsPollStateForTests({ cursorMs: 100, lastEventCount: 1 });
      __setKcEventsPollStateForTests({ cursorMs: 200, lastEventCount: 3, errorCount: 2 });
      const state = getKcEventsPollState();
      expect(state?.cursorMs).toBe(200);
      expect(state?.lastEventCount).toBe(3);
      expect(state?.errorCount).toBe(2);
    });
  });

  describe("getQueueStats", () => {
    beforeEach(() => {
      __resetQueueStatsForTests();
    });

    afterEach(() => {
      __resetQueueStatsForTests();
    });

    it("returns null when queue has never been used (zero state)", async () => {
      const stats = await getQueueStats();
      expect(stats).toBeNull();
    });

    it("returns counts from in-memory state", async () => {
      __setQueueStatsForTests({
        pending: 3,
        running: 0,
        failed: 1,
        total: 4,
      });

      const stats = await getQueueStats();
      expect(stats).not.toBeNull();
      expect(stats).toEqual({
        pending: 3,
        running: 0,
        failed: 1,
        total: 4,
      });
    });

    it("exposes running jobs separately from pending", async () => {
      __setQueueStatsForTests({
        pending: 0,
        running: 2,
        failed: 0,
        total: 5,
      });

      const stats = await getQueueStats();
      expect(stats?.running).toBe(2);
      expect(stats?.pending).toBe(0);
      expect(stats?.total).toBe(5);
    });

    it("returns non-null when only failed counter has been incremented", async () => {
      __setQueueStatsForTests({
        pending: 0,
        running: 0,
        failed: 2,
        total: 2,
      });
      const stats = await getQueueStats();
      expect(stats).not.toBeNull();
      expect(stats?.failed).toBe(2);
    });
  });
});
