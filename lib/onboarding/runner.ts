"use client";

import introJs from "intro.js";
import "intro.js/introjs.css";
import { TOURS, type TourDefinition, buildFullSystemTour } from "./tour";

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

/**
 * Uruchamia trasę intro.js dla danego panelu. Zwraca Promise który
 * resolve-uje się po zakończeniu lub przerwaniu trasy. Po sukcesie
 * patchuje `prefs.introCompletedSteps` przez API żeby kolejne wejście
 * nie odpalało automatycznie.
 *
 * Specjalny tourId `"full-system"` buduje trasę dynamicznie z user roles —
 * pokazuje WYŁĄCZNIE kafelki/sekcje do których user ma dostęp.
 *
 * @param tourId klucz z TOURS lub "full-system"
 * @param opts.persist domyślnie true — zapisz w prefs że ukończono
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
  const intro = introJs.tour();
  intro.setOptions({
    steps: tour.steps.map((s) => ({
      element: s.element,
      title: s.title,
      intro: s.intro,
      position: s.position,
    })),
    nextLabel: "Dalej",
    prevLabel: "Wstecz",
    doneLabel: "Zakończ",
    skipLabel: "Pomiń",
    showStepNumbers: true,
    showProgress: true,
    exitOnOverlayClick: false,
    keyboardNavigation: true,
    overlayOpacity: 0.6,
  });

  // Auto-enrol w Moodle przed startem trasy (best-effort, fire-and-forget).
  void enrolInOnboarding();

  return new Promise((resolve) => {
    let completed = false;
    intro.oncomplete(() => {
      completed = true;
    });
    intro.onexit(() => {
      if (completed && persist) void markCompleted(tourId);
      resolve({ completed });
    });
    intro.start();
  });
}

async function markCompleted(tourId: string): Promise<void> {
  // Idzie przez /api/account/onboarding bo ten endpoint jednocześnie
  // patchuje prefs.introCompletedSteps i — jeśli Moodle skonfigurowany —
  // oznacza odpowiadający kurs jako ukończony (best-effort).
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

/**
 * Self-enrol w Moodle "Onboarding MyPerformance". Wywoływane gdy user
 * pierwszy raz odpala intro.js trasę — dzięki temu progres pokazuje się
 * też w Akademii (Moodle) bez ręcznej akcji.
 */
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

/**
 * Sprawdza czy user już ukończył tour. Używane w panelach żeby
 * NIE auto-startować trasy która już się odbyła.
 */
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
