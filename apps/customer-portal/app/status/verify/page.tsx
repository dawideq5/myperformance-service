import { VerifyForm } from "./_components/VerifyForm";

export const metadata = {
  title: "Wpisz kod",
};

interface Props {
  searchParams: Promise<{ email?: string }>;
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;
  const masked = user.length <= 2 ? user[0] + "*" : user[0] + "***";
  return `${masked}@${domain}`;
}

export default async function VerifyPage({ searchParams }: Props) {
  const params = await searchParams;
  const email = (params.email ?? "").trim().toLowerCase();
  return (
    <section className="mx-auto max-w-md px-4 md:px-6 py-12 md:py-20">
      <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-3">
        Wpisz kod
      </h1>
      <p
        className="text-sm leading-relaxed mb-8"
        style={{ color: "var(--text-muted)" }}
      >
        Wysłaliśmy 6-cyfrowy kod na{" "}
        <span className="font-mono" style={{ color: "var(--text)" }}>
          {email ? maskEmail(email) : "Twój email"}
        </span>
        . Kod jest ważny przez 10 minut.
      </p>
      <VerifyForm email={email} />
    </section>
  );
}
