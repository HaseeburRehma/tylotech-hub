import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { MonthlyMetric, MonthlyReportData } from "@/lib/reports/monthly";

const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 60, paddingHorizontal: 44, fontSize: 10, color: "#1a1a1a", fontFamily: "Helvetica" },
  bar: { height: 6, borderRadius: 3, marginBottom: 20 },
  eyebrow: { fontSize: 9, color: "#6b6b6b", letterSpacing: 1, textTransform: "uppercase" },
  h1: { fontSize: 22, fontFamily: "Helvetica-Bold", marginTop: 4 },
  sub: { fontSize: 11, color: "#6b6b6b", marginTop: 2, marginBottom: 22 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  cell: { width: "33.33%", paddingHorizontal: 4, marginBottom: 8 },
  card: { borderWidth: 1, borderColor: "#e6e6e6", borderRadius: 8, padding: 10 },
  label: { fontSize: 8.5, color: "#6b6b6b" },
  value: { fontSize: 16, fontFamily: "Helvetica-Bold", marginTop: 3 },
  change: { fontSize: 8.5, marginTop: 2 },
  muted: { fontSize: 8, color: "#9a9a9a" },
  empty: { fontSize: 11, color: "#6b6b6b", marginTop: 8, lineHeight: 1.5 },
  li: { flexDirection: "row", marginBottom: 4 },
  liDate: { width: 60, fontSize: 9, color: "#6b6b6b" },
  liText: { flex: 1, fontSize: 10 },
  note: { fontSize: 8.5, color: "#6b6b6b", marginTop: 6, lineHeight: 1.4 },
  footer: { position: "absolute", bottom: 26, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderColor: "#eee", paddingTop: 8 },
});

const nf = (max: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: max });
const eur = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0 }).format(v);

function formatValue(m: MonthlyMetric) {
  if (m.unit === "currency") return eur(m.value);
  if (m.unit === "ratio") return `${nf(2).format(m.value)}x`;
  if (m.unit === "percent") return `${nf(2).format(m.value)} %`;
  return nf(0).format(m.value);
}

function ChangeLine({ m }: { m: MonthlyMetric }) {
  if (m.change == null) return <Text style={[styles.change, { color: "#9a9a9a" }]}>kein Vormonatsvergleich</Text>;
  const good = m.lowerIsBetter ? m.change <= 0 : m.change >= 0;
  return (
    <Text style={[styles.change, { color: good ? "#1f8a4c" : "#c0392b" }]}>
      {m.change > 0 ? "+" : ""}
      {nf(1).format(m.change)} % ggü. Vormonat
    </Text>
  );
}

export function MonthlyReportDocument({ data, generatedAt }: { data: MonthlyReportData; generatedAt: string }) {
  return (
    <Document title={`${data.company} — Monatsbericht ${data.periodLabel}`} author="TyloTech">
      <Page size="A4" style={styles.page}>
        <View style={[styles.bar, { backgroundColor: data.brandColor }]} />
        <Text style={styles.eyebrow}>Monatsbericht</Text>
        <Text style={styles.h1}>{data.company}</Text>
        <Text style={styles.sub}>{data.rangeLabel}</Text>

        {!data.hasData ? (
          <Text style={styles.empty}>
            Für diesen Monat liegen noch keine Daten aus verbundenen Quellen vor. Sobald Meta Ads, Google Ads,
            Search Console oder Google Analytics verbunden sind, erscheinen die Kennzahlen hier automatisch.
          </Text>
        ) : (
          data.sections.map((s) => (
            <View key={s.key} style={styles.section} wrap={false}>
              <Text style={styles.sectionTitle}>{s.title}</Text>
              <View style={styles.grid}>
                {s.metrics.map((m) => (
                  <View key={m.label} style={styles.cell}>
                    <View style={styles.card}>
                      <Text style={styles.label}>{m.label}</Text>
                      <Text style={styles.value}>{formatValue(m)}</Text>
                      <ChangeLine m={m} />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}

        {data.updates.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Was wir diesen Monat umgesetzt haben</Text>
            {data.updates.map((u, i) => (
              <View key={i} style={styles.li}>
                <Text style={styles.liDate}>{u.date}</Text>
                <Text style={styles.liText}>{u.title}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.note}>
          Alle Werte stammen direkt aus den verbundenen Plattformen. Vergleiche mit dem Vormonat werden nur angezeigt,
          wenn für beide Monate Daten vorliegen.
        </Text>

        <View style={styles.footer} fixed>
          <Text style={styles.muted}>Erstellt mit TyloTech · {generatedAt}</Text>
          <Text style={styles.muted} render={({ pageNumber, totalPages }) => `Seite ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
