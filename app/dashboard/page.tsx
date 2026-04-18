import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CalendarDays, ShieldCheck, User as UserIcon } from "lucide-react";
import { authOptions } from "@/app/auth";
import { AppHeader } from "@/components/AppHeader";
import { Card, PageShell } from "@/components/ui";

export const dynamic = "force-dynamic";

interface QuickLink {
  title: string;
  description: string;
  href: string;
  icon: typeof UserIcon;
  accentClass: string;
}

const QUICK_LINKS: QuickLink[] = [
  {
    title: "Profil",
    description: "Edytuj dane osobowe i preferencje konta.",
    href: "/account?tab=profile",
    icon: UserIcon,
    accentClass: "bg-[var(--accent)]/10 text-[var(--accent)]",
  },
  {
    title: "Bezpieczeństwo",
    description: "Zarządzaj 2FA, kluczami bezpieczeństwa i hasłem.",
    href: "/account?tab=security",
    icon: ShieldCheck,
    accentClass: "bg-green-500/10 text-green-500",
  },
  {
    title: "Integracje",
    description: "Podłącz konto Google, korzystaj z kalendarza.",
    href: "/account?tab=integrations",
    icon: CalendarDays,
    accentClass: "bg-blue-500/10 text-blue-500",
  },
];

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.error === "RefreshTokenExpired") {
    redirect("/login");
  }

  const fullName =
    session.user.name ||
    [
      (session.user as { firstName?: string }).firstName,
      (session.user as { lastName?: string }).lastName,
    ]
      .filter(Boolean)
      .join(" ") ||
    session.user.email ||
    "Użytkowniku";

  const email = session.user.email ?? undefined;

  return (
    <PageShell
      maxWidth="xl"
      header={<AppHeader userLabel={fullName} userSubLabel={email} />}
    >
      <section className="mb-10">
        <p className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider">
          Pulpit
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--text-main)] mt-2">
          Witaj, {fullName}
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2 max-w-xl">
          Stąd zarządzasz swoim kontem, integracjami oraz bezpieczeństwem.
          Więcej usług dostępne wkrótce.
        </p>
      </section>

      <section aria-labelledby="quick-links-heading">
        <h2
          id="quick-links-heading"
          className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3"
        >
          Szybki dostęp
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {QUICK_LINKS.map(({ title, description, href, icon: Icon, accentClass }) => (
            <Link
              key={href}
              href={href}
              className="group focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 rounded-2xl"
            >
              <Card
                interactive
                padding="md"
                className="h-full flex flex-col gap-4"
              >
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center ${accentClass}`}
                >
                  <Icon className="w-6 h-6" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[var(--text-main)]">
                    {title}
                  </h3>
                  <p className="text-sm text-[var(--text-muted)] mt-1">
                    {description}
                  </p>
                </div>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)]">
                  Przejdź
                  <ArrowRight
                    className="w-4 h-4 transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="upcoming-heading" className="mt-12">
        <h2
          id="upcoming-heading"
          className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3"
        >
          Nadchodzące
        </h2>
        <Card padding="lg" className="border-dashed flex flex-col items-center gap-3 text-center">
          <ShieldCheck
            className="w-8 h-8 text-[var(--text-muted)] opacity-60"
            aria-hidden="true"
          />
          <p className="text-sm text-[var(--text-muted)] uppercase tracking-wider font-semibold">
            Więcej usług wkrótce
          </p>
        </Card>
      </section>
    </PageShell>
  );
}
