/* eslint-disable jsx-a11y/alt-text */
import {
  Document,
  Font,
  G,
  Image,
  Page,
  StyleSheet,
  Svg,
  Circle,
  Rect,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import path from "path";

// Roboto z Polish glyph support — załadowane z public/fonts/ (offline,
// nie zależy od zewnętrznych URL na serwerze).
const FONTS_DIR = path.join(process.cwd(), "public", "fonts");

function ensureFontRegistered(): void {
  // Idempotentne — Font.register można wywołać wielokrotnie.
  try {
    Font.register({
      family: "Roboto",
      fonts: [
        {
          src: path.join(FONTS_DIR, "Roboto-Regular.ttf"),
          fontWeight: 400,
        },
        {
          src: path.join(FONTS_DIR, "Roboto-Bold.ttf"),
          fontWeight: 700,
        },
      ],
    });
  } catch {
    /* ignore — fonty mogą nie istnieć (opcjonalne) */
  }
}

export interface ReceiptInput {
  ticketNumber: string;
  createdAt: string;
  customer: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
  };
  device: { brand: string; model: string; imei: string; color: string };
  lock: { type: string; code: string };
  description: string;
  visualCondition: {
    display_rating?: number;
    back_rating?: number;
    camera_rating?: number;
    frames_rating?: number;
    powers_on?: string;
    cracked_front?: boolean;
    cracked_back?: boolean;
    bent?: boolean;
    face_touch_id?: boolean;
    water_damage?: string;
    charging_current?: number;
    cleaning_accepted?: boolean;
    damage_markers?: {
      id: string;
      x: number;
      y: number;
      z: number;
      surface?: string;
      description?: string;
    }[];
  };
  estimate: number | null;
  cleaningPrice: number | null;
  cleaningAccepted: boolean;
  handover: { choice: "none" | "items"; items: string };
}

const DISPLAY_DESCRIPTIONS: Record<number, string> = {
  10: "Stan idealny — bez śladów użytkowania, ekran nieuszkodzony.",
  9: "Bardzo lekkie ślady — ledwo widoczne pod kątem.",
  8: "Drobne rysy widoczne pod światłem.",
  7: "Widoczne rysy, ekran w pełni czytelny.",
  6: "Liczne rysy, drobne uszkodzenia powłoki.",
  5: "Wyraźne rysy, czasem widoczne podczas użytkowania.",
  4: "Pęknięty narożnik lub krawędź, ekran działa.",
  3: "Pęknięty ekran, ale działa i reaguje na dotyk.",
  2: "Mocno popękany ekran, dotyk częściowo zaburzony.",
  1: "Zniszczony ekran — ciężko czytelny lub uszkodzony dotyk.",
};
const BACK_DESCRIPTIONS: Record<number, string> = {
  10: "Stan idealny — bez śladów użytkowania.",
  9: "Bardzo lekkie ślady — ledwo widoczne.",
  8: "Drobne rysy lub mikropęknięcia.",
  7: "Widoczne rysy, brak pęknięć.",
  6: "Drobne pęknięcia, panel cały.",
  5: "Pęknięcia, ale panel trzyma się solidnie.",
  4: "Pęknięty panel tylny, fragmenty na miejscu.",
  3: "Pęknięty z ubytkami szkła.",
  2: "Mocno zniszczony, brakujące fragmenty.",
  1: "Brak panelu lub całkowicie rozbity.",
};
const CAMERA_DESCRIPTIONS: Record<number, string> = {
  10: "Stan idealny obiektywów i wyspy aparatów.",
  9: "Lekkie ślady na ramce wyspy.",
  8: "Drobne rysy na obudowie wyspy.",
  7: "Widoczne rysy ramki, szkła całe.",
  6: "Mikrorysy szkieł obiektywów.",
  5: "Wyraźne rysy szkieł, fotografia OK.",
  4: "Pęknięte jedno z obiektywów.",
  3: "Pęknięte szkiełka, plamy widoczne na zdjęciach.",
  2: "Wiele pęknięć, fotografia z artefaktami.",
  1: "Zniszczone aparaty — fotografia niemożliwa.",
};
const FRAMES_DESCRIPTIONS: Record<number, string> = {
  10: "Ramki idealne — bez śladów.",
  9: "Mikrorysy widoczne pod kątem.",
  8: "Drobne otarcia na rogach.",
  7: "Widoczne otarcia, brak deformacji.",
  6: "Otarcia + drobne wgniecenia.",
  5: "Wgniecenia, ramki proste.",
  4: "Wyraźne wgniecenia, lekkie odkształcenie.",
  3: "Odkształcenia narożników.",
  2: "Mocno wygięte ramki.",
  1: "Ramki zniszczone — wpływa na działanie.",
};
function ratingDesc(
  cat: "display" | "back" | "camera" | "frames",
  v: number | undefined,
): string {
  if (v == null) return "";
  const tables = {
    display: DISPLAY_DESCRIPTIONS,
    back: BACK_DESCRIPTIONS,
    camera: CAMERA_DESCRIPTIONS,
    frames: FRAMES_DESCRIPTIONS,
  };
  return tables[cat][v] ?? "";
}

const REGULATIONS: { title: string; body: string }[] = [
  {
    title: "1. Postanowienia ogólne",
    body: '1.1. Właścicielem punktów "Serwis Telefonów Caseownia" oraz strony www.serwis.caseownia.com jest UNIKOM S.C. Krzysztof Rojek, ul. Towarowa 2c, 43-100 Tychy, NIP: 646-283-18-04, REGON: 240976330.\n1.2. Regulamin określa zasady świadczenia usług serwisowych oraz sprzedaży produktów w sklepach Caseownia i Smart Connect.\n1.5. Klient, przekazując urządzenie do Serwisu, akceptuje warunki niniejszego regulaminu.',
  },
  {
    title: "2. Przyjęcie urządzenia",
    body: "2.1. Przyjęcie potwierdzane jest protokołem zawierającym dane Klienta, opis usterki, stan wizualny oraz akcesoria.",
  },
  {
    title: "3. Wykonywanie usług",
    body: "3.3. Klient musi zaakceptować kosztorys przed naprawą. Brak akceptacji w ciągu 14 dni może skutkować zwrotem urządzenia bez naprawy.\n3.5. Serwis nie ponosi odpowiedzialności za dane w urządzeniu. Klient jest zobowiązany wykonać kopię zapasową.",
  },
  {
    title: "4. Gwarancja i odpowiedzialność",
    body: "4.1. Na wykonane naprawy Serwis udziela gwarancji na okres 3 miesięcy, o ile nie uzgodniono inaczej.\n4.2. Gwarancja obejmuje jedynie zakres naprawy i użyte części. Nie obejmuje uszkodzeń mechanicznych i zalania.\n4.4. Serwis nie gwarantuje zachowania fabrycznej wodoszczelności urządzenia (klasa IP67/IP68 i inne) po dokonanej naprawie.\n4.5. Serwis nie bierze odpowiedzialności za uszkodzenie lub konieczność odklejenia szkieł hartowanych oraz folii ochronnych podczas procesu serwisowego.",
  },
  {
    title: "5. Odbiór urządzenia",
    body: "5.1. Klient zobowiązany jest odebrać urządzenie w ciągu 21 dni od powiadomienia.\n5.3. Jeśli urządzenie nie zostanie odebrane w ciągu 90 dni, Serwis może uznać je za porzucone (art. 180 KC).",
  },
  {
    title: "6. Reklamacje",
    body: "6.1. Reklamacje należy zgłaszać pisemnie lub na adres biuro@caseownia.com. Serwis rozpatruje je w ciągu 14 dni.",
  },
  {
    title: "7. RODO — Ochrona danych osobowych",
    body: "7.1. Administratorem danych jest UNIKOM S.C. Dane przetwarzane są wyłącznie w celu realizacji zlecenia. Klient ma prawo do wglądu i poprawiania swoich danych.",
  },
];

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontFamily: "Roboto",
    fontSize: 9,
    color: "#1a1a1a",
    lineHeight: 1.4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: "#1a1a1a",
    marginBottom: 10,
  },
  headerLogo: { height: 38, width: 170 },
  ticketNo: { fontSize: 18, fontWeight: 700, textAlign: "right" },
  ticketDate: {
    fontSize: 8,
    color: "#666",
    textAlign: "right",
    marginTop: 2,
  },
  h2: {
    fontSize: 9,
    fontWeight: 700,
    marginTop: 8,
    marginBottom: 4,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  twoCol: { flexDirection: "row", gap: 14 },
  col: { flex: 1 },
  fieldLabel: {
    fontSize: 7,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 3,
  },
  fieldValue: { fontSize: 9.5, fontWeight: 500 },
  lockBlock: {
    backgroundColor: "#f0f0f0",
    borderLeftWidth: 3,
    borderLeftColor: "#1a1a1a",
    padding: 6,
    marginVertical: 4,
  },
  lockCode: { fontSize: 11, fontWeight: 700 },
  descBlock: {
    backgroundColor: "#f5f5f5",
    borderLeftWidth: 3,
    borderLeftColor: "#1a1a1a",
    padding: 6,
    marginVertical: 3,
  },
  totalBlock: {
    borderWidth: 1.2,
    borderColor: "#1a1a1a",
    padding: 6,
    marginVertical: 4,
    backgroundColor: "#fafafa",
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1 },
  totalFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 3,
    marginTop: 3,
    borderTopWidth: 1.2,
    borderTopColor: "#1a1a1a",
    fontSize: 11,
    fontWeight: 700,
  },
  handoverBlock: {
    backgroundColor: "#f0f0f0",
    borderLeftWidth: 3,
    borderLeftColor: "#1a1a1a",
    padding: 6,
    marginVertical: 4,
  },
  signatures: {
    flexDirection: "row",
    gap: 16,
    marginTop: 14,
  },
  sigBox: {
    flex: 1,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
    fontSize: 7.5,
    color: "#444",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    minHeight: 30,
  },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 28,
    right: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#aaa",
    paddingTop: 6,
    fontSize: 7,
    color: "#666",
  },
  footerLogo: { height: 18, width: 70 },
  techRow: { flexDirection: "row", gap: 8, marginVertical: 4 },
  markerNum: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#1a1a1a",
    color: "#fff",
    fontSize: 7,
    fontWeight: 700,
    textAlign: "center",
    paddingTop: 2,
    marginRight: 4,
  },
  markerRow: { flexDirection: "row", marginBottom: 2 },
  ratingsTable: { marginVertical: 2 },
  ratingRow: {
    flexDirection: "row",
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
  },
  ratingLabel: { width: 80, fontWeight: 700, fontSize: 8 },
  ratingValue: { flex: 1, fontSize: 8, color: "#333" },
  regHeading: { fontSize: 8.5, fontWeight: 700, marginTop: 6, marginBottom: 2 },
  regBody: { fontSize: 7.5, color: "#333", lineHeight: 1.4 },
});

const LOCK_LABELS: Record<string, string> = {
  none: "Brak blokady",
  pin: "Hasło / PIN",
  pattern: "Wzór",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Projekcja markera 3D → 2D na phone outline. */
function projectMarker(
  m: { x: number; y: number; z: number; surface?: string },
): { view: "front" | "back"; px: number; py: number } {
  const Z_RANGE = 0.85;
  const Y_RANGE = 1.7;
  const px = ((m.z + Z_RANGE) / (2 * Z_RANGE)) * 100;
  const py = ((Y_RANGE - m.y) / (2 * Y_RANGE)) * 100;
  const s = (m.surface ?? "").toLowerCase();
  const view: "front" | "back" =
    s.includes("tylny") || s.includes("aparat") || m.x < 0 ? "back" : "front";
  return {
    view,
    px: Math.max(8, Math.min(92, px)),
    py: Math.max(6, Math.min(94, py)),
  };
}

function PhoneOutlineSvg({
  markers,
  view,
  label,
}: {
  markers: { id: string; x: number; y: number; z: number; surface?: string }[];
  view: "front" | "back";
  label: string;
}) {
  const W = 70;
  const H = 130;
  // Filter + map z indeksami przed render — żeby nie rendrować null'i
  // wewnątrz Svg (które w niektórych konfigach @react-pdf crashują).
  const visible = markers
    .map((m, i) => ({ m, i, p: projectMarker(m) }))
    .filter((it) => it.p.view === view);
  return (
    <View>
      <Svg width={W} height={H + 14} viewBox={`0 0 ${W} ${H + 14}`}>
        <Rect
          x={2}
          y={2}
          width={W - 4}
          height={H - 4}
          rx={9}
          ry={9}
          fill="#fafafa"
          stroke="#1a1a1a"
          strokeWidth={1}
        />
        <Rect
          x={6}
          y={14}
          width={W - 12}
          height={H - 28}
          rx={3}
          ry={3}
          fill="#fff"
          stroke="#888"
          strokeWidth={0.5}
        />
        <Circle cx={W / 2} cy={9} r={1.5} fill="#444" />
        {visible.map(({ m, i, p }) => {
          const cx = (p.px / 100) * W;
          const cy = (p.py / 100) * H;
          return (
            <G key={m.id}>
              <Circle
                cx={cx}
                cy={cy}
                r={4}
                fill="#1a1a1a"
                stroke="#fff"
                strokeWidth={0.8}
              />
              <Text
                x={cx}
                y={cy + 1.5}
                fill="#fff"
                textAnchor="middle"
                style={{ fontSize: 5, fontWeight: 700 }}
              >
                {String(i + 1)}
              </Text>
            </G>
          );
        })}
        <Text
          x={W / 2}
          y={H + 8}
          fill="#333"
          textAnchor="middle"
          style={{ fontSize: 6, fontWeight: 700 }}
        >
          {label}
        </Text>
      </Svg>
    </View>
  );
}

function ReceiptDocument({ data }: { data: ReceiptInput }) {
  const v = data.visualCondition;
  const markers = v.damage_markers ?? [];
  const ratings: { cat: "display" | "back" | "camera" | "frames"; label: string; value: number | undefined }[] = [
    { cat: "display", label: "Wyświetlacz", value: v.display_rating },
    { cat: "back", label: "Panel tylny", value: v.back_rating },
    { cat: "camera", label: "Wyspa aparatów", value: v.camera_rating },
    { cat: "frames", label: "Ramki boczne", value: v.frames_rating },
  ];
  const checklist: { label: string; value: string }[] = [];
  if (v.powers_on) {
    const lab: Record<string, string> = {
      yes: "Włącza się",
      no: "NIE włącza się",
      vibrates: "Wibruje, ekran nie reaguje",
    };
    checklist.push({ label: "Zasilanie", value: lab[v.powers_on] ?? v.powers_on });
  }
  if (v.cracked_front) checklist.push({ label: "Pęknięcia", value: "Pęknięty z przodu" });
  if (v.cracked_back) checklist.push({ label: "Pęknięcia", value: "Pęknięty z tyłu" });
  if (v.bent) checklist.push({ label: "Geometria", value: "Wygięty" });
  if (v.face_touch_id === false) checklist.push({ label: "Face/Touch ID", value: "Nie działa" });
  if (v.water_damage === "yes") checklist.push({ label: "Zalanie", value: "Tak" });
  if (v.water_damage === "unknown") checklist.push({ label: "Zalanie", value: "Nie ustalono" });
  if (v.charging_current != null) {
    checklist.push({
      label: "Prąd ładowania",
      value: `${v.charging_current.toFixed(2)} A`,
    });
  }

  const repair = data.estimate ?? 0;
  const cleaning = data.cleaningAccepted && data.cleaningPrice ? data.cleaningPrice : 0;
  const total = repair + cleaning;

  const logoSerwis = path.join(process.cwd(), "public", "logos", "serwis-by-caseownia.png");
  const logoCaseownia = path.join(process.cwd(), "public", "logos", "caseownia.jpeg");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Image src={logoSerwis} style={styles.headerLogo} />
          <View>
            <Text style={styles.ticketNo}>{data.ticketNumber}</Text>
            <Text style={styles.ticketDate}>{formatDate(data.createdAt)}</Text>
          </View>
        </View>

        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Text style={styles.h2}>Klient</Text>
            <Text style={styles.fieldLabel}>Imię i nazwisko</Text>
            <Text style={styles.fieldValue}>
              {data.customer.firstName} {data.customer.lastName}
            </Text>
            <Text style={styles.fieldLabel}>Telefon</Text>
            <Text style={styles.fieldValue}>{data.customer.phone || "—"}</Text>
            {data.customer.email ? (
              <View>
                <Text style={styles.fieldLabel}>Email</Text>
                <Text style={styles.fieldValue}>{data.customer.email}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.col}>
            <Text style={styles.h2}>Urządzenie</Text>
            <Text style={styles.fieldLabel}>Marka i model</Text>
            <Text style={styles.fieldValue}>
              {data.device.brand} {data.device.model}
            </Text>
            <Text style={styles.fieldLabel}>Kolor</Text>
            <Text style={styles.fieldValue}>{data.device.color || "—"}</Text>
            <Text style={styles.fieldLabel}>IMEI</Text>
            <Text style={styles.fieldValue}>{data.device.imei || "—"}</Text>
          </View>
        </View>

        {data.lock.type !== "none" ? (
          <View style={styles.lockBlock}>
            <Text style={styles.fieldLabel}>
              {LOCK_LABELS[data.lock.type] ?? data.lock.type}
            </Text>
            <Text style={styles.lockCode}>{data.lock.code}</Text>
          </View>
        ) : null}

        <Text style={styles.h2}>Opis usterki</Text>
        <View style={styles.descBlock}>
          <Text>{data.description || "(brak opisu)"}</Text>
        </View>

        {markers.length > 0 ? (
          <View>
            <Text style={styles.h2}>Lokalizacja uszkodzeń</Text>
            <View style={styles.techRow}>
              <PhoneOutlineSvg markers={markers} view="front" label="PRZÓD" />
              <PhoneOutlineSvg markers={markers} view="back" label="TYŁ" />
              <View style={{ flex: 1 }}>
                {markers.map((m, i) => (
                  <View key={m.id} style={styles.markerRow}>
                    <Text style={styles.markerNum}>{String(i + 1)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 7, color: "#666", textTransform: "uppercase", letterSpacing: 0.4 }}>
                        {m.surface ?? "powierzchnia"}
                      </Text>
                      <Text style={{ fontSize: 8 }}>
                        {m.description?.trim() || "(brak opisu)"}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {ratings.some((r) => r.value != null) || checklist.length > 0 ? (
          <View>
            <Text style={styles.h2}>Stan techniczny</Text>
            <View style={styles.ratingsTable}>
              {ratings
                .filter((r) => r.value != null)
                .map((r) => (
                  <View key={r.cat} style={styles.ratingRow}>
                    <Text style={styles.ratingLabel}>{r.label}</Text>
                    <Text style={styles.ratingValue}>{ratingDesc(r.cat, r.value)}</Text>
                  </View>
                ))}
              {checklist.map((it, i) => (
                <View key={`c-${i}`} style={styles.ratingRow}>
                  <Text style={styles.ratingLabel}>{it.label}</Text>
                  <Text style={styles.ratingValue}>{it.value}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Text style={styles.h2}>Wycena orientacyjna</Text>
        <View style={styles.totalBlock}>
          <View style={styles.totalRow}>
            <Text>Naprawa</Text>
            <Text>{repair.toFixed(2)} PLN</Text>
          </View>
          {data.cleaningAccepted && data.cleaningPrice != null ? (
            <View style={styles.totalRow}>
              <Text>Czyszczenie urządzenia</Text>
              <Text>{data.cleaningPrice.toFixed(2)} PLN</Text>
            </View>
          ) : null}
          <View style={styles.totalFinal}>
            <Text>Razem orientacyjnie</Text>
            <Text>{total.toFixed(2)} PLN</Text>
          </View>
        </View>

        <Text style={styles.h2}>Potwierdzenie odbioru</Text>
        <View style={styles.handoverBlock}>
          {data.handover.choice === "none" ? (
            <Text>
              Potwierdzam, że przyjmowane urządzenie nie posiada karty SIM,
              karty pamięci SD ani nie posiadało etui przy przyjęciu.
            </Text>
          ) : (
            <View>
              <Text style={{ fontWeight: 700, marginBottom: 2 }}>
                Pobrane od klienta dodatkowe przedmioty:
              </Text>
              <Text>{data.handover.items}</Text>
            </View>
          )}
        </View>

        <View style={styles.signatures}>
          <View style={styles.sigBox}>
            <Text>Podpis pracownika</Text>
          </View>
          <View style={styles.sigBox}>
            <Text>Podpis klienta</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text>Serwis Telefonów by Caseownia · UNIKOM S.C.</Text>
          <Image src={logoCaseownia} style={styles.footerLogo} />
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: 700,
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          Regulamin świadczenia usług serwisowych
        </Text>
        {REGULATIONS.map((r) => (
          <View key={r.title} wrap={false}>
            <Text style={styles.regHeading}>{r.title}</Text>
            <Text style={styles.regBody}>{r.body}</Text>
          </View>
        ))}
        <View style={styles.footer}>
          <Text>UNIKOM S.C. · biuro@caseownia.com</Text>
          <Image src={logoCaseownia} style={styles.footerLogo} />
        </View>
      </Page>
    </Document>
  );
}

/** Renderuje PDF do Buffer. Server-side use only. */
export async function renderReceiptPdf(data: ReceiptInput): Promise<Buffer> {
  ensureFontRegistered();
  return await renderToBuffer(<ReceiptDocument data={data} />);
}
