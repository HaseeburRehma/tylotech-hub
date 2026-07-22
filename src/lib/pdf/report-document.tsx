import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export interface ReportProps {
  company: string;
  brandColor: string; // hex
  period: string;
  generatedAt: string;
  kpis: { label: string; value: string; delta: string }[];
  channels: { name: string; spend: string; leads: string; cpl: string; roas: string }[];
}

const styles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 44, fontSize: 10, color: "#1a1a1a", fontFamily: "Helvetica" },
  bar: { height: 6, borderRadius: 3, marginBottom: 22 },
  h1: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  sub: { fontSize: 11, color: "#6b6b6b", marginBottom: 24 },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 10, marginTop: 8 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5, marginBottom: 14 },
  kpiCard: { width: "50%", paddingHorizontal: 5, marginBottom: 10 },
  kpiInner: { borderWidth: 1, borderColor: "#e6e6e6", borderRadius: 8, padding: 12 },
  kpiLabel: { fontSize: 9, color: "#6b6b6b" },
  kpiValue: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 4 },
  kpiDelta: { fontSize: 9, marginTop: 2 },
  tHead: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#1a1a1a", paddingBottom: 6, marginBottom: 2 },
  tRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#eee", paddingVertical: 7 },
  th: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#6b6b6b" },
  td: { fontSize: 10 },
  c1: { width: "32%" },
  c: { width: "17%" },
  footer: { position: "absolute", bottom: 28, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderColor: "#eee", paddingTop: 8 },
  muted: { fontSize: 8, color: "#9a9a9a" },
});

export function ReportDocument(props: ReportProps) {
  const { company, brandColor, period, generatedAt, kpis, channels } = props;
  return (
    <Document title={`${company} — Performance Report`} author="TyloTech">
      <Page size="A4" style={styles.page}>
        <View style={[styles.bar, { backgroundColor: brandColor }]} />
        <Text style={styles.h1}>{company}</Text>
        <Text style={styles.sub}>Performance Report · {period}</Text>

        <Text style={styles.sectionTitle}>Key metrics</Text>
        <View style={styles.kpiRow}>
          {kpis.map((k) => (
            <View key={k.label} style={styles.kpiCard}>
              <View style={styles.kpiInner}>
                <Text style={styles.kpiLabel}>{k.label}</Text>
                <Text style={styles.kpiValue}>{k.value}</Text>
                <Text style={[styles.kpiDelta, { color: brandColor }]}>{k.delta} vs last period</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Channel performance</Text>
        <View style={styles.tHead}>
          <Text style={[styles.th, styles.c1]}>Channel</Text>
          <Text style={[styles.th, styles.c]}>Spend</Text>
          <Text style={[styles.th, styles.c]}>Leads</Text>
          <Text style={[styles.th, styles.c]}>CPL</Text>
          <Text style={[styles.th, styles.c]}>ROAS</Text>
        </View>
        {channels.map((c) => (
          <View key={c.name} style={styles.tRow}>
            <Text style={[styles.td, styles.c1]}>{c.name}</Text>
            <Text style={[styles.td, styles.c]}>{c.spend}</Text>
            <Text style={[styles.td, styles.c]}>{c.leads}</Text>
            <Text style={[styles.td, styles.c]}>{c.cpl}</Text>
            <Text style={[styles.td, styles.c]}>{c.roas}</Text>
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text style={styles.muted}>Generated {generatedAt} · Powered by TyloTech</Text>
          <Text style={styles.muted} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
