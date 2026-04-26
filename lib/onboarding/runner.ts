"use client";

import { createRoot, type Root } from "react-dom/client";
import { Tour } from "@/components/ui/Tour";
import { TOURS, buildFullSystemTour, type TourDefinition } from "./tour";
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
 * Uruchamia branded tour (komponent Tour z components/ui/Tour.tsx).
 * Tworzy detached container w body, mountuje React root, czeka na
 * onClose i resolve-uje promise. Po sukcesie patch prefs / Moodle.
 */
export async function runTour(
  tourId: string,
  opts: { persist?: boolean } = {},
): Promise<{ completed: boolean }> {
  let tour: TourDefinition | undefined;
  if (tourId === "full-system") {
    const roles = await fetchUserRoles();
    tour = buildFullSystemTour(roles);
  } else {
    tour = TOURS[tourId];
  }
  if (!tour) return { completed: false };

  const persist = opts.persist ?? true;
  void enrolInOnboarding();

  // Cleanup poprzedniego tour, jeśli ktoś wyzwolił dwa razy
  teardown();

  return new Promise((resolve) => {
    activeContainer = document.createElement("div");
    activeContainer.setAttribute("data-mp-tour-root", "");
    document.body.appendChild(activeContainer);
    activeRoot = createRoot(activeContainer);

    const handleClose = (completed: boolean) => {
      if (completed && persist) void markCompleted(tourId);
      teardown();
      resolve({ completed });
    };

    activeRoot.render(
      createElement(Tour, {
        steps: tour!.steps.map((s) => ({
          element: s.element,
          title: s.title,
          body: s.body,
          more: s.more,
          allowInteraction: s.allowInteraction,
        })),
        open: true,
        onClose: handleClose,
        label: tour!.label,
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
