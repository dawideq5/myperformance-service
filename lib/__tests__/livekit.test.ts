import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Captures the most recent grant passed to AccessToken#addGrant, so each test
// can assert on the permission shape without parsing the JWT itself.
let lastGrant: Record<string, unknown> | null = null;
let lastConstructorArgs: unknown[] = [];
let lastTokenOptions: Record<string, unknown> | null = null;

const toJwtMock = vi.fn(async () => "stub.jwt.token");
const addGrantMock = vi.fn((grant: Record<string, unknown>) => {
  lastGrant = grant;
});
const createRoomMock = vi.fn(async (opts: { name: string }) => ({
  name: opts.name,
  sid: "RM_test123",
  numParticipants: 0,
  creationTime: BigInt(1_700_000_000),
}));
const listRoomsMock = vi.fn(async () => []);
const listParticipantsMock = vi.fn(async () => []);

vi.mock("livekit-server-sdk", () => {
  class AccessToken {
    constructor(...args: unknown[]) {
      lastConstructorArgs = args;
      lastTokenOptions = (args[2] as Record<string, unknown>) ?? null;
    }
    addGrant = addGrantMock;
    toJwt = toJwtMock;
  }
  class RoomServiceClient {
    createRoom = createRoomMock;
    listRooms = listRoomsMock;
    listParticipants = listParticipantsMock;
  }
  return { AccessToken, RoomServiceClient };
});

// Import AFTER vi.mock — module-under-test resolves the mocked SDK.
import {
  LiveKitNotConfiguredError,
  createPublisherToken,
  createRoom,
  createSubscriberToken,
  getRoomInfo,
  isConfigured,
} from "@/lib/livekit";

function setEnv(): void {
  vi.stubEnv("LIVEKIT_URL", "wss://livekit.test.local");
  vi.stubEnv("LIVEKIT_API_KEY", "APItestkey");
  vi.stubEnv("LIVEKIT_API_SECRET", "supersecret-supersecret-supersecret");
}

function clearEnv(): void {
  vi.stubEnv("LIVEKIT_URL", "");
  vi.stubEnv("LIVEKIT_API_KEY", "");
  vi.stubEnv("LIVEKIT_API_SECRET", "");
}

describe("lib/livekit", () => {
  beforeEach(() => {
    lastGrant = null;
    lastConstructorArgs = [];
    lastTokenOptions = null;
    toJwtMock.mockClear();
    addGrantMock.mockClear();
    createRoomMock.mockClear();
    listRoomsMock.mockClear();
    listParticipantsMock.mockClear();
    setEnv();
    // Silence the structured logger output during tests.
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("isConfigured", () => {
    it("returns true when all env vars are set", () => {
      expect(isConfigured()).toBe(true);
    });

    it("returns false when LIVEKIT_URL missing", () => {
      vi.stubEnv("LIVEKIT_URL", "");
      expect(isConfigured()).toBe(false);
    });
  });

  describe("createPublisherToken", () => {
    it("returns a non-empty JWT string and grants publish-only", async () => {
      const jwt = await createPublisherToken({
        identity: "mobile-abc",
        roomName: "mp-service-svc1-xyz",
      });
      expect(typeof jwt).toBe("string");
      expect(jwt.length).toBeGreaterThan(0);
      expect(toJwtMock).toHaveBeenCalledOnce();

      expect(lastGrant).toMatchObject({
        roomJoin: true,
        room: "mp-service-svc1-xyz",
        canPublish: true,
        canSubscribe: false,
      });
    });

    it("forwards apiKey + apiSecret to AccessToken constructor", async () => {
      await createPublisherToken({
        identity: "mobile-abc",
        roomName: "mp-service-svc1-xyz",
      });
      expect(lastConstructorArgs[0]).toBe("APItestkey");
      expect(lastConstructorArgs[1]).toBe("supersecret-supersecret-supersecret");
      expect(lastTokenOptions).toMatchObject({
        identity: "mobile-abc",
        ttl: 30 * 60,
      });
    });

    it("respects a custom ttlSec", async () => {
      await createPublisherToken({
        identity: "mobile-abc",
        roomName: "mp-service-svc1-xyz",
        ttlSec: 120,
      });
      expect(lastTokenOptions).toMatchObject({ ttl: 120 });
    });

    it("throws LiveKitNotConfiguredError when env is missing", async () => {
      clearEnv();
      await expect(
        createPublisherToken({
          identity: "mobile-abc",
          roomName: "mp-service-svc1-xyz",
        }),
      ).rejects.toBeInstanceOf(LiveKitNotConfiguredError);
    });

    it("throws when identity is empty", async () => {
      await expect(
        createPublisherToken({
          identity: "   ",
          roomName: "mp-service-svc1-xyz",
        }),
      ).rejects.toThrow(/identity is required/);
    });

    it("throws when roomName is empty", async () => {
      await expect(
        createPublisherToken({
          identity: "mobile-abc",
          roomName: "",
        }),
      ).rejects.toThrow(/roomName is required/);
    });
  });

  describe("createSubscriberToken", () => {
    it("grants subscribe-only (no publish, no data)", async () => {
      const jwt = await createSubscriberToken({
        identity: "user@example.com",
        roomName: "mp-service-svc1-xyz",
      });
      expect(typeof jwt).toBe("string");
      expect(lastGrant).toMatchObject({
        roomJoin: true,
        room: "mp-service-svc1-xyz",
        canPublish: false,
        canSubscribe: true,
        canPublishData: false,
      });
    });

    it("throws LiveKitNotConfiguredError on missing API_SECRET", async () => {
      vi.stubEnv("LIVEKIT_API_SECRET", "");
      await expect(
        createSubscriberToken({
          identity: "user@example.com",
          roomName: "mp-service-svc1-xyz",
        }),
      ).rejects.toBeInstanceOf(LiveKitNotConfiguredError);
    });
  });

  describe("createRoom", () => {
    it("calls RoomServiceClient.createRoom with our defaults", async () => {
      await createRoom({ name: "mp-service-svc1-xyz" });
      expect(createRoomMock).toHaveBeenCalledOnce();
      const args = createRoomMock.mock.calls[0][0];
      expect(args).toMatchObject({
        name: "mp-service-svc1-xyz",
        emptyTimeout: 30 * 60,
        maxParticipants: 10,
      });
    });

    it("forwards explicit overrides", async () => {
      await createRoom({
        name: "mp-service-svc1-xyz",
        emptyTimeoutSec: 60,
        maxParticipants: 2,
        metadata: "{\"k\":\"v\"}",
      });
      const args = createRoomMock.mock.calls[0][0];
      expect(args).toMatchObject({
        name: "mp-service-svc1-xyz",
        emptyTimeout: 60,
        maxParticipants: 2,
        metadata: "{\"k\":\"v\"}",
      });
    });

    it("rejects empty room name", async () => {
      await expect(createRoom({ name: "" })).rejects.toThrow(/room name is required/);
    });

    it("propagates SDK errors", async () => {
      createRoomMock.mockRejectedValueOnce(new Error("livekit unreachable"));
      await expect(createRoom({ name: "x" })).rejects.toThrow(/livekit unreachable/);
    });
  });

  describe("getRoomInfo", () => {
    it("returns sid=null when room has been auto-closed", async () => {
      listRoomsMock.mockResolvedValueOnce([]);
      const info = await getRoomInfo("mp-service-svc1-xyz");
      expect(info).toMatchObject({
        sid: null,
        name: "mp-service-svc1-xyz",
        numParticipants: 0,
        creationTime: null,
      });
      expect(listParticipantsMock).not.toHaveBeenCalled();
    });

    it("returns sid + participants when room is active", async () => {
      listRoomsMock.mockResolvedValueOnce([
        {
          name: "mp-service-svc1-xyz",
          sid: "RM_test123",
          numParticipants: 1,
          creationTime: BigInt(1_700_000_000),
        },
      ]);
      listParticipantsMock.mockResolvedValueOnce([
        {
          identity: "mobile-xyz",
          sid: "PA_test",
          state: 2,
          joinedAt: BigInt(1_700_000_010),
        },
      ]);
      const info = await getRoomInfo("mp-service-svc1-xyz");
      expect(info.sid).toBe("RM_test123");
      expect(info.numParticipants).toBe(1);
      expect(info.creationTime).toBe(1_700_000_000);
      expect(info.participants).toHaveLength(1);
      expect(info.participants[0]).toMatchObject({
        identity: "mobile-xyz",
        sid: "PA_test",
      });
    });
  });
});
