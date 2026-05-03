/**
 * LiveKit token issuer + room management — Wave 22 / F16b.
 *
 * Wraps `livekit-server-sdk` with the project's env-based config + structured
 * audit logging. Used by `app/api/livekit/*` route handlers to issue per-call
 * tokens (publisher = serwisant-mobile camera, subscriber = serwisant panel)
 * and provision rooms with sane defaults (auto-close 30 min idle, max 10
 * participants).
 *
 * Permission model:
 *   - publisher tokens  → canPublish=true,  canSubscribe=false (camera-only)
 *   - subscriber tokens → canPublish=false, canSubscribe=true  (read-only feed)
 *
 * The split is intentional — a serwisant's panel never publishes back
 * to a service room (no camera/mic on their end), and a mobile publisher
 * never views other tracks (just streams their own device view).
 *
 * Configuration (env, fail-closed if missing):
 *   - LIVEKIT_URL         e.g. wss://livekit.myperformance.pl  (also serves https)
 *   - LIVEKIT_API_KEY     KC-style API key id
 *   - LIVEKIT_API_SECRET  HMAC secret used to sign access tokens
 *
 * `LIVEKIT_TURN_URL` is consumed by the mobile/panel clients — server-side
 * code does not need it. We do not commit any secrets here, .env.example holds
 * the placeholders.
 */

import {
  AccessToken,
  RoomServiceClient,
  type VideoGrant,
} from "livekit-server-sdk";
import type { ParticipantInfo, Room } from "@livekit/protocol";

import { getRequiredEnv } from "@/lib/env";
import { log } from "@/lib/logger";

const logger = log.child({ module: "livekit" });

/** Default token TTL — 30 min covers a normal diagnostic call. */
const DEFAULT_TOKEN_TTL_SEC = 30 * 60;
/** Default empty-room timeout — auto-close the room 30 min after creation if no one joins. */
const DEFAULT_EMPTY_TIMEOUT_SEC = 30 * 60;
/** Default max participants — 10 is enough for serwisant + mobile + observer. */
const DEFAULT_MAX_PARTICIPANTS = 10;

export class LiveKitNotConfiguredError extends Error {
  constructor(missing: string) {
    super(`LiveKit not configured: missing ${missing}`);
    this.name = "LiveKitNotConfiguredError";
  }
}

interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

/**
 * Reads LiveKit env on every call (no module-level snapshot) so tests can
 * vi.stubEnv() per-case and so secret rotations propagate without restart.
 * Throws `LiveKitNotConfiguredError` when any required var is missing.
 */
function loadConfig(): LiveKitConfig {
  let url: string;
  let apiKey: string;
  let apiSecret: string;
  try {
    url = getRequiredEnv("LIVEKIT_URL");
  } catch {
    throw new LiveKitNotConfiguredError("LIVEKIT_URL");
  }
  try {
    apiKey = getRequiredEnv("LIVEKIT_API_KEY");
  } catch {
    throw new LiveKitNotConfiguredError("LIVEKIT_API_KEY");
  }
  try {
    apiSecret = getRequiredEnv("LIVEKIT_API_SECRET");
  } catch {
    throw new LiveKitNotConfiguredError("LIVEKIT_API_SECRET");
  }
  return { url, apiKey, apiSecret };
}

/**
 * The REST endpoint for RoomService is HTTP, not WebSocket. LiveKit accepts
 * both `wss://` and `https://` in `LIVEKIT_URL` (the SDK normalises the scheme
 * for the RPC client), but we strip an explicit `wss://` prefix to be safe and
 * deterministic across SDK versions.
 */
function toHttpUrl(wsUrl: string): string {
  return wsUrl.replace(/^wss:\/\//i, "https://").replace(/^ws:\/\//i, "http://");
}

/**
 * Returns the configured LiveKit WS URL (used by clients to connect via the
 * `livekit-client` SDK). Throws if env is missing.
 */
export function getLiveKitUrl(): string {
  return loadConfig().url;
}

/**
 * True when all required env vars are set. Used by health checks / panels
 * that want to grey-out the "Live view" button when the feature isn't
 * provisioned yet (matches the rest of the codebase's `*Configured` pattern).
 */
export function isConfigured(): boolean {
  try {
    loadConfig();
    return true;
  } catch {
    return false;
  }
}

export interface IssueTokenOptions {
  /** Stable participant id — for the panel side use email, for mobile use `mobile-<svc>`. */
  identity: string;
  /** LiveKit room name — must already exist (or will be auto-created on first join). */
  roomName: string;
  /** Lifetime of the JWT, in seconds. Defaults to 30 min. */
  ttlSec?: number;
  /** Display name shown in the LiveKit UI — falls back to identity. */
  name?: string;
  /** Free-form metadata (string) — exposed on `Participant.metadata`. */
  metadata?: string;
}

/**
 * Issues a publisher token — grants the holder the right to JOIN the named
 * room and PUBLISH tracks. Subscribe is explicitly denied so the mobile
 * publisher cannot snoop on other participants.
 *
 * Audit-logged at `info` level so token issuance is reconstructable from
 * structured logs (correlated by `requestId` via AsyncLocalStorage).
 */
export async function createPublisherToken(
  opts: IssueTokenOptions,
): Promise<string> {
  const { identity, roomName } = validateTokenOpts(opts);
  const cfg = loadConfig();
  const ttl = opts.ttlSec ?? DEFAULT_TOKEN_TTL_SEC;

  const token = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity,
    ttl,
    name: opts.name,
    metadata: opts.metadata,
  });
  const grant: VideoGrant = {
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: false,
    // Data channel is convenient for "stop streaming" handshake from the
    // panel side; LiveKit defaults canPublishData=true when unset, but we
    // pin it explicitly so the contract is auditable from the token alone.
    canPublishData: true,
  };
  token.addGrant(grant);

  const jwt = await token.toJwt();
  logger.info("publisher token issued", {
    identity,
    roomName,
    ttlSec: ttl,
  });
  return jwt;
}

/**
 * Issues a subscriber token — grants JOIN + SUBSCRIBE only. Used by the
 * serwisant panel (`panels/serwisant/components/LiveDeviceViewer.tsx`) to
 * watch a room without ever publishing audio/video back.
 */
export async function createSubscriberToken(
  opts: IssueTokenOptions,
): Promise<string> {
  const { identity, roomName } = validateTokenOpts(opts);
  const cfg = loadConfig();
  const ttl = opts.ttlSec ?? DEFAULT_TOKEN_TTL_SEC;

  const token = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity,
    ttl,
    name: opts.name,
    metadata: opts.metadata,
  });
  const grant: VideoGrant = {
    roomJoin: true,
    room: roomName,
    canPublish: false,
    canSubscribe: true,
    canPublishData: false,
  };
  token.addGrant(grant);

  const jwt = await token.toJwt();
  logger.info("subscriber token issued", {
    identity,
    roomName,
    ttlSec: ttl,
  });
  return jwt;
}

function validateTokenOpts(opts: IssueTokenOptions): {
  identity: string;
  roomName: string;
} {
  const identity = opts.identity?.trim();
  const roomName = opts.roomName?.trim();
  if (!identity) {
    throw new Error("identity is required");
  }
  if (!roomName) {
    throw new Error("roomName is required");
  }
  return { identity, roomName };
}

export interface CreateRoomOptions {
  name: string;
  /** Auto-close empty rooms after this many seconds. Default: 30 min. */
  emptyTimeoutSec?: number;
  /** Hard cap on simultaneous participants. Default: 10. */
  maxParticipants?: number;
  /** Free-form metadata stored on the room (JSON string by convention). */
  metadata?: string;
}

/**
 * Creates a LiveKit room with our defaults. Idempotent on the LiveKit side —
 * if a room with this name already exists the server returns its current
 * info; we surface the same `Room` object either way.
 *
 * Returns the LiveKit `Room` proto so callers can inspect `sid`, `creationTime`,
 * `numParticipants` etc. Throws on transport / auth / validation errors.
 */
export async function createRoom(opts: CreateRoomOptions): Promise<Room> {
  const name = opts.name?.trim();
  if (!name) {
    throw new Error("room name is required");
  }
  const cfg = loadConfig();
  const client = new RoomServiceClient(
    toHttpUrl(cfg.url),
    cfg.apiKey,
    cfg.apiSecret,
  );
  try {
    const room = await client.createRoom({
      name,
      emptyTimeout: opts.emptyTimeoutSec ?? DEFAULT_EMPTY_TIMEOUT_SEC,
      maxParticipants: opts.maxParticipants ?? DEFAULT_MAX_PARTICIPANTS,
      metadata: opts.metadata,
    });
    logger.info("room created", {
      roomName: name,
      sid: room.sid,
      emptyTimeoutSec: opts.emptyTimeoutSec ?? DEFAULT_EMPTY_TIMEOUT_SEC,
      maxParticipants: opts.maxParticipants ?? DEFAULT_MAX_PARTICIPANTS,
    });
    return room;
  } catch (err) {
    logger.error("createRoom failed", {
      roomName: name,
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export interface RoomInfo {
  /** LiveKit-assigned server-side id (`RM_xxx`). null when the room is gone. */
  sid: string | null;
  /** Echo of the requested name. */
  name: string;
  /** Number of currently connected participants. 0 when room not active. */
  numParticipants: number;
  /** Unix-seconds the room was created. null when room not active. */
  creationTime: number | null;
  /** Active participant identities (subset of LiveKit ParticipantInfo). */
  participants: Array<{
    identity: string;
    sid: string;
    state: number;
    joinedAt: number;
  }>;
}

/**
 * Best-effort room lookup. When the room has been auto-closed (empty timeout
 * elapsed) LiveKit returns no entry in `listRooms` — we surface that as
 * `sid=null, numParticipants=0` so callers can render "rozmowa zakończona"
 * without an exception path.
 */
export async function getRoomInfo(roomName: string): Promise<RoomInfo> {
  const name = roomName?.trim();
  if (!name) {
    throw new Error("roomName is required");
  }
  const cfg = loadConfig();
  const client = new RoomServiceClient(
    toHttpUrl(cfg.url),
    cfg.apiKey,
    cfg.apiSecret,
  );
  let rooms: Room[] = [];
  let participants: ParticipantInfo[] = [];
  try {
    rooms = await client.listRooms([name]);
  } catch (err) {
    logger.error("listRooms failed", {
      roomName: name,
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  const room = rooms.find((r) => r.name === name) ?? null;
  if (room) {
    try {
      participants = await client.listParticipants(name);
    } catch (err) {
      // listParticipants can race with auto-close; degrade gracefully.
      logger.warn("listParticipants failed (continuing)", {
        roomName: name,
        err: err instanceof Error ? err.message : String(err),
      });
      participants = [];
    }
  }
  return {
    sid: room?.sid ?? null,
    name,
    numParticipants: room?.numParticipants ?? 0,
    creationTime: room ? Number(room.creationTime) : null,
    participants: participants.map((p) => ({
      identity: p.identity,
      sid: p.sid,
      state: p.state,
      joinedAt: Number(p.joinedAt),
    })),
  };
}

/**
 * Wave 23 — browser publisher token.
 *
 * Sprzedawca otwiera konsultację video w intake formularzu — kamera +
 * mikrofon laptopa. W odróżnieniu od mobilnego publishera (F16c, usuniętego
 * w Wave 23) browser publisher TEŻ subskrybuje (żeby zobaczyć zwrotny
 * stream agenta Chatwoot, gdy ten włączy własną kamerę). Stąd
 * `canPublish=true` AND `canSubscribe=true`.
 */
export async function createBrowserPublisherToken(
  opts: IssueTokenOptions,
): Promise<string> {
  const { identity, roomName } = validateTokenOpts(opts);
  const cfg = loadConfig();
  const ttl = opts.ttlSec ?? DEFAULT_TOKEN_TTL_SEC;

  const token = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity,
    ttl,
    name: opts.name,
    metadata: opts.metadata,
  });
  const grant: VideoGrant = {
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  };
  token.addGrant(grant);

  const jwt = await token.toJwt();
  logger.info("browser publisher token issued", {
    identity,
    roomName,
    ttlSec: ttl,
  });
  return jwt;
}

/**
 * Wave 23 (overlay) — mobile publisher token.
 *
 * Sprzedawca generuje QR z URL'em do mobile publisher PWA
 * (`apps/upload-bridge/livestream`). Mobile po skanowaniu otwiera URL
 * z `?room=X&token=Y`, łączy się jako publisher (kamera tylna domyślnie,
 * `canPublish=true, canSubscribe=false` — mobile nie podgląda agenta).
 *
 * Identity = `mobile-<rand>` (nie email klienta — anonimizacja). TTL 30 min
 * pokrywa typowe okno czasu między wystawieniem QR a faktycznym dołączeniem.
 */
export async function createMobilePublisherToken(
  opts: IssueTokenOptions,
): Promise<string> {
  const { identity, roomName } = validateTokenOpts(opts);
  const cfg = loadConfig();
  const ttl = opts.ttlSec ?? DEFAULT_TOKEN_TTL_SEC;

  const token = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity,
    ttl,
    name: opts.name,
    metadata: opts.metadata,
  });
  const grant: VideoGrant = {
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: false,
    canPublishData: true,
  };
  token.addGrant(grant);

  const jwt = await token.toJwt();
  logger.info("mobile publisher token issued", {
    identity,
    roomName,
    ttlSec: ttl,
  });
  return jwt;
}

/**
 * Wave 23 — signed join URL helper.
 *
 * Wystawiamy krótki HS256 token (TTL 30 min domyślnie), który wkleimy
 * w link wysłany do rozmowy Chatwoot. Agent klika → `/konsultacja/<room>?token=...`,
 * tam server-side weryfikujemy podpis i wystawiamy subscriber token LiveKit
 * (kanał oddzielny od MyPerformance KC SSO — agent nie loguje się tam).
 *
 * Klucz: `LIVEKIT_API_SECRET` (już używany do podpisu LiveKit access tokens).
 * Audience: `mp-consultation-join` żeby ten sam secret nie pomylił się
 * z innymi tokenami.
 */
export interface JoinTokenClaims {
  /** LiveKit room name. */
  room: string;
  /** Display identity (np. "Konsultant serwisowy" — pokazane w viewer UI). */
  identity: string;
  /** Issued-at (sec since epoch). */
  iat: number;
  /** Expiry (sec since epoch). */
  exp: number;
  /** Audience guard. */
  aud: "mp-consultation-join";
}

const JOIN_TOKEN_AUDIENCE = "mp-consultation-join";
const JOIN_TOKEN_DEFAULT_TTL_SEC = 30 * 60;

export interface SignJoinTokenOptions {
  roomName: string;
  identity: string;
  ttlSec?: number;
}

export async function signJoinToken(opts: SignJoinTokenOptions): Promise<string> {
  const cfg = loadConfig();
  const room = opts.roomName?.trim();
  const identity = opts.identity?.trim();
  if (!room) throw new Error("roomName is required");
  if (!identity) throw new Error("identity is required");
  const { SignJWT } = await import("jose");
  const ttl = opts.ttlSec ?? JOIN_TOKEN_DEFAULT_TTL_SEC;
  const now = Math.floor(Date.now() / 1000);
  const secret = new TextEncoder().encode(cfg.apiSecret);
  return new SignJWT({ room, identity })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(JOIN_TOKEN_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .sign(secret);
}

export async function verifyJoinToken(token: string): Promise<JoinTokenClaims> {
  const cfg = loadConfig();
  const { jwtVerify } = await import("jose");
  const secret = new TextEncoder().encode(cfg.apiSecret);
  const { payload } = await jwtVerify(token, secret, {
    audience: JOIN_TOKEN_AUDIENCE,
    algorithms: ["HS256"],
  });
  if (typeof payload.room !== "string" || typeof payload.identity !== "string") {
    throw new Error("malformed join token");
  }
  return {
    room: payload.room,
    identity: payload.identity,
    iat: typeof payload.iat === "number" ? payload.iat : 0,
    exp: typeof payload.exp === "number" ? payload.exp : 0,
    aud: JOIN_TOKEN_AUDIENCE,
  };
}

/**
 * Wave 23 (overlay) — Chatwoot agent initiate token.
 *
 * Wystawiany przy GET /api/livekit/intake-snapshot (gdy iframe ładuje
 * podgląd intake'u dla konkretnego service_id). Krótki TTL = 5 min,
 * audience `mp-chatwoot-initiate`. Konsumowany przez
 * /api/livekit/start-from-chatwoot-agent — jedyna autoryzacja dla
 * publicznego endpointu który tworzy nowy LiveKit room.
 *
 * Claim `service_id` jest twardo związany z requestem — agent nie może
 * podstawić innego service_id niż widzi w iframe.
 */
const CHATWOOT_INITIATE_AUDIENCE = "mp-chatwoot-initiate";
const CHATWOOT_INITIATE_DEFAULT_TTL_SEC = 5 * 60;

/**
 * Wave 24 — token może być zakotwiczony albo na `serviceId` (istniejący
 * service został już zapisany), albo na `conversationId` (sprzedawca jeszcze
 * nie zapisał intake'u — Dashboard App pokazuje draft preview po
 * conversation_id). Dokładnie jeden klucz musi być obecny.
 */
export interface ChatwootInitiateClaims {
  serviceId: string | null;
  conversationId: number | null;
  iat: number;
  exp: number;
  aud: "mp-chatwoot-initiate";
}

export async function signChatwootInitiateToken(opts: {
  serviceId?: string;
  conversationId?: number;
  ttlSec?: number;
}): Promise<string> {
  const cfg = loadConfig();
  const serviceId = opts.serviceId?.trim() || null;
  const conversationId =
    typeof opts.conversationId === "number" &&
    Number.isFinite(opts.conversationId) &&
    opts.conversationId > 0
      ? Math.floor(opts.conversationId)
      : null;
  if (!serviceId && conversationId == null) {
    throw new Error("serviceId or conversationId is required");
  }
  const { SignJWT } = await import("jose");
  const ttl = opts.ttlSec ?? CHATWOOT_INITIATE_DEFAULT_TTL_SEC;
  const now = Math.floor(Date.now() / 1000);
  const secret = new TextEncoder().encode(cfg.apiSecret);
  const claims: Record<string, string | number> = {};
  if (serviceId) claims.serviceId = serviceId;
  if (conversationId != null) claims.conversationId = conversationId;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(CHATWOOT_INITIATE_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .sign(secret);
}

export async function verifyChatwootInitiateToken(
  token: string,
): Promise<ChatwootInitiateClaims> {
  const cfg = loadConfig();
  const { jwtVerify } = await import("jose");
  const secret = new TextEncoder().encode(cfg.apiSecret);
  const { payload } = await jwtVerify(token, secret, {
    audience: CHATWOOT_INITIATE_AUDIENCE,
    algorithms: ["HS256"],
  });
  const serviceId =
    typeof payload.serviceId === "string" ? payload.serviceId : null;
  const conversationId =
    typeof payload.conversationId === "number"
      ? payload.conversationId
      : null;
  if (!serviceId && conversationId == null) {
    throw new Error("malformed chatwoot initiate token");
  }
  return {
    serviceId,
    conversationId,
    iat: typeof payload.iat === "number" ? payload.iat : 0,
    exp: typeof payload.exp === "number" ? payload.exp : 0,
    aud: CHATWOOT_INITIATE_AUDIENCE,
  };
}

/**
 * Wave 23 — pełen URL który wysyłamy do Chatwoot conversation. Trzymamy
 * helper tu (a nie w route handlerze) żeby ujednolicić format.
 */
export function buildJoinUrl(baseUrl: string, roomName: string, joinToken: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/konsultacja/${encodeURIComponent(roomName)}?token=${encodeURIComponent(joinToken)}`;
}

/**
 * Wave 23 — Force-end room (admin oversight + sprzedawca self-end).
 * Triggers LiveKit `room_finished` webhook automatically.
 */
export async function deleteRoom(roomName: string): Promise<void> {
  const name = roomName?.trim();
  if (!name) throw new Error("roomName is required");
  const cfg = loadConfig();
  const client = new RoomServiceClient(
    toHttpUrl(cfg.url),
    cfg.apiKey,
    cfg.apiSecret,
  );
  try {
    await client.deleteRoom(name);
    logger.info("room deleted", { roomName: name });
  } catch (err) {
    logger.error("deleteRoom failed", {
      roomName: name,
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Wave 23 — list ALL rooms on the LiveKit server. Used by /admin/livekit
 * to count live participants per room (DB sessions table doesn't track that).
 */
export async function listAllRooms(): Promise<Room[]> {
  const cfg = loadConfig();
  const client = new RoomServiceClient(
    toHttpUrl(cfg.url),
    cfg.apiKey,
    cfg.apiSecret,
  );
  return client.listRooms();
}
