/**
 * Wave 22 / F7 — re-export shim. Single source of truth żyje w
 * `lib/services/status-meta.ts` (root repo) i jest mirrorowany do
 * `panels/serwisant/lib/services/status-meta.ts`. Ten plik istnieje tylko
 * po to, żeby nie wymuszać jednoczesnego update'u 10+ konsumentów panelu
 * w jednym commicie — kolejne zmiany powinny importować bezpośrednio z
 * `@/lib/services/status-meta`.
 *
 * NIE dodawaj tu nowej logiki. Edytuj plik kanoniczny w
 * `lib/services/status-meta.ts`, potem `cp` do
 * `panels/<x>/lib/services/status-meta.ts`.
 */
export * from "@/lib/services/status-meta";
