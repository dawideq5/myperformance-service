"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import { ApiRequestError } from "@/lib/api-client";
import {
  accountService,
  googleService,
  kadromierzService,
  moodleService,
} from "./account-service";
import type {
  GoogleStatus,
  KadromierzStatus,
  KeycloakSession,
  MoodleStatus,
  TwoFAStatus,
  UserProfile,
  WebAuthnKey,
} from "./types";

type Status = "idle" | "loading" | "ready" | "error";

interface AccountContextValue {
  status: Status;
  error: string | null;
  profile: UserProfile | null;
  sessions: KeycloakSession[];
  twoFA: TwoFAStatus | null;
  webauthnKeys: WebAuthnKey[];
  googleStatus: GoogleStatus | null;
  kadromierzStatus: KadromierzStatus | null;
  moodleStatus: MoodleStatus | null;
  currentSessionId: string | undefined;
  refetchAll: () => Promise<void>;
  refetchProfile: () => Promise<void>;
  refetchSessions: () => Promise<void>;
  refetchTwoFA: () => Promise<void>;
  refetchWebAuthn: () => Promise<void>;
  refetchGoogleStatus: () => Promise<GoogleStatus | null>;
  refetchKadromierzStatus: () => Promise<KadromierzStatus | null>;
  refetchMoodleStatus: () => Promise<MoodleStatus | null>;
  patchProfile: (profile: UserProfile) => void;
  removeSessionLocally: (id: string) => void;
  setGoogleConnected: (connected: boolean) => void;
  setKadromierzStatus: (status: KadromierzStatus | null) => void;
  setWebauthnKeys: (keys: WebAuthnKey[]) => void;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();
  const currentSessionId =
    (session?.user as { sid?: string } | undefined)?.sid ?? undefined;

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<KeycloakSession[]>([]);
  const [twoFA, setTwoFA] = useState<TwoFAStatus | null>(null);
  const [webauthnKeys, setWebauthnKeys] = useState<WebAuthnKey[]>([]);
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null);
  const [kadromierzStatus, setKadromierzStatus] =
    useState<KadromierzStatus | null>(null);
  const [moodleStatus, setMoodleStatus] = useState<MoodleStatus | null>(null);

  const loadedRef = useRef(false);

  const refetchProfile = useCallback(async () => {
    try {
      const data = await accountService.getProfile();
      setProfile(data);
    } catch (err) {
      if (err instanceof ApiRequestError && err.isUnauthorized) return;
      throw err;
    }
  }, []);

  const refetchSessions = useCallback(async () => {
    try {
      const data = await accountService.getSessions();
      setSessions(
        data.map((s) => ({ ...s, current: s.id === currentSessionId })),
      );
    } catch (err) {
      if (err instanceof ApiRequestError && err.isUnauthorized) return;
      throw err;
    }
  }, [currentSessionId]);

  const refetchTwoFA = useCallback(async () => {
    try {
      setTwoFA(await accountService.get2FA());
    } catch (err) {
      if (err instanceof ApiRequestError && err.isUnauthorized) return;
      throw err;
    }
  }, []);

  const refetchWebAuthn = useCallback(async () => {
    try {
      const { keys } = await accountService.getWebAuthnKeys();
      setWebauthnKeys(keys ?? []);
    } catch (err) {
      if (err instanceof ApiRequestError && err.isUnauthorized) return;
      throw err;
    }
  }, []);

  const refetchGoogleStatus = useCallback(async () => {
    try {
      const data = await googleService.getStatus();
      setGoogleStatus(data);
      return data;
    } catch (err) {
      if (err instanceof ApiRequestError && err.isUnauthorized) return null;
      return null;
    }
  }, []);

  const refetchKadromierzStatus = useCallback(async () => {
    try {
      const data = await kadromierzService.getStatus();
      setKadromierzStatus(data);
      return data;
    } catch (err) {
      if (err instanceof ApiRequestError && err.isUnauthorized) return null;
      return null;
    }
  }, []);

  const refetchMoodleStatus = useCallback(async () => {
    try {
      const data = await moodleService.getStatus();
      setMoodleStatus(data);
      return data;
    } catch (err) {
      if (err instanceof ApiRequestError && err.isUnauthorized) return null;
      return null;
    }
  }, []);

  const refetchAll = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      await Promise.all([
        refetchProfile(),
        refetchSessions(),
        refetchTwoFA(),
        refetchWebAuthn(),
        refetchGoogleStatus(),
        refetchKadromierzStatus(),
        refetchMoodleStatus(),
      ]);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "Nie udało się pobrać danych konta",
      );
    }
  }, [
    refetchProfile,
    refetchSessions,
    refetchTwoFA,
    refetchWebAuthn,
    refetchGoogleStatus,
    refetchKadromierzStatus,
    refetchMoodleStatus,
  ]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    if (loadedRef.current) return;
    loadedRef.current = true;
    void refetchAll();
  }, [sessionStatus, refetchAll]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && loadedRef.current) {
        void refetchProfile();
        void refetchSessions();
        void refetchGoogleStatus();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refetchProfile, refetchSessions, refetchGoogleStatus]);

  const patchProfile = useCallback((next: UserProfile) => {
    setProfile(next);
  }, []);

  const removeSessionLocally = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const setGoogleConnected = useCallback((connected: boolean) => {
    setGoogleStatus((prev) =>
      prev ? { ...prev, connected } : { connected },
    );
  }, []);

  const value = useMemo<AccountContextValue>(
    () => ({
      status,
      error,
      profile,
      sessions,
      twoFA,
      webauthnKeys,
      googleStatus,
      kadromierzStatus,
      moodleStatus,
      currentSessionId,
      refetchAll,
      refetchProfile,
      refetchSessions,
      refetchTwoFA,
      refetchWebAuthn,
      refetchGoogleStatus,
      refetchKadromierzStatus,
      refetchMoodleStatus,
      patchProfile,
      removeSessionLocally,
      setGoogleConnected,
      setKadromierzStatus,
      setWebauthnKeys,
    }),
    [
      status,
      error,
      profile,
      sessions,
      twoFA,
      webauthnKeys,
      googleStatus,
      kadromierzStatus,
      moodleStatus,
      currentSessionId,
      refetchAll,
      refetchProfile,
      refetchSessions,
      refetchTwoFA,
      refetchWebAuthn,
      refetchGoogleStatus,
      refetchKadromierzStatus,
      refetchMoodleStatus,
      patchProfile,
      removeSessionLocally,
      setGoogleConnected,
    ],
  );

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}

export function useAccount(): AccountContextValue {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error("useAccount must be used within AccountProvider");
  }
  return context;
}
