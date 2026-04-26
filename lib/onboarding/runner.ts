"use client";

import { createRoot, type Root } from "react-dom/client";
import { Tour } from "@/components/ui/Tour";
import { buildFullSystemTour } from "./tour";
import { createElement } from "react";

let activeRoot: Root | null = null;
let activeContainer: HTMLDivElement | null = null;

async function fetchUserRoles(): Promise<string[]> {
  try {
    const res = await fetch("/api/auth/session", { credentials: "include" });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.user?.roles) ? json.user.roles : [];
  } catch {
    return [];
  }
}

function teardown() {
  if (activeRoot) {
    activeRoot.unmount();
    activeRoot = null;
  }
  if (activeContainer && activeContainer.parentElement) {
    activeContainer.parentElement.removeChild(activeContainer);
  }
  activeContainer = null;
}

/**
 * Uruchamia jedyny zorganizowany przewodnik po systemie. Kroki budowane
 * dynamicznie z dostępnych userowi paneli — opisuje co znajdziesz wewnątrz.
 *
 * Akceptuje stary `tourId` argument dla kompatybilności call-site'ów —
 * niezależnie od wartości buduje full-system tour.
 */
export async function runTour(
  _tourId?: string,
  opts: { persist?: boolean } = {},
): Promise<{ completed: boolean }> {
  const roles = await fetchUserRoles();
  const tour = buildFullSystemTour(roles);
  const persist = opts.persist ?? true;

  void enrolInOnboarding();
  teardown();

  return new Promise((resolve) => {
    activeContainer = document.createElement("div");
    activeContainer.setAttribute("data-mp-tour-root", "");
    document.body.appendChild(activeContainer);
    activeRoot = createRoot(activeContainer);

    const handleClose = (completed: boolean) => {
      if (completed && persist) void markCompleted("full-system");
      teardown();
      resolve({ completed });
    };

    activeRoot.render(
      createElement(Tour, {
        steps: tour.steps,
        open: true,
        onClose: handleClose,
        label: tour.label,
      }),
    );
  });
}

async function markCompleted(tourId: string): Promise<void> {
  try {
    await fetch("/api/account/onboarding", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete", tourId }),
    });
  } catch {
    // best-effort
  }
}

export async function enrolInOnboarding(): Promise<void> {
  try {
    await fetch("/api/account/onboarding", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "enrol" }),
    });
  } catch {
    // best-effort
  }
}

export async function hasCompletedTour(tourId: string): Promise<boolean> {
  try {
    const res = await fetch("/api/account/preferences", {
      credentials: "include",
    });
    if (!res.ok) return true;
    const json = await res.json();
    const completed: string[] = json.data.prefs.introCompletedSteps ?? [];
    return completed.includes(tourId);
  } catch {
    return true;
  }
}
