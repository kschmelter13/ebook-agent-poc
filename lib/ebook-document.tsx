import {
  Circle,
  Document,
  Image,
  Link,
  Page,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import type { Ebook } from "@/agent/lib/ebook";

const colors = {
  ink: "#14213d",
  paper: "#fbfaf6",
  accent: "#f4a261",
  teal: "#2a9d8f",
  muted: "#657083",
  rule: "#d9d5c9",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.paper,
    color: colors.ink,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    lineHeight: 1.55,
    paddingBottom: 54,
    paddingHorizontal: 58,
    paddingTop: 54,
  },
  cover: {
    backgroundColor: colors.ink,
    color: "#ffffff",
    fontFamily: "Helvetica",
    padding: 0,
    position: "relative",
  },
  coverImage: {
    height: "100%",
    left: 0,
    objectFit: "cover",
    opacity: 0.62,
    position: "absolute",
    top: 0,
    width: "100%",
  },
  coverOverlay: {
    backgroundColor: "rgba(8, 18, 38, 0.56)",
    height: "100%",
    left: 0,
    position: "absolute",
    top: 0,
    width: "100%",
  },
  coverContent: {
    bottom: 66,
    left: 58,
    position: "absolute",
    right: 58,
  },
  coverEyebrow: {
    color: "#f8d7aa",
    fontSize: 10,
    letterSpacing: 2.4,
    marginBottom: 22,
    textTransform: "uppercase",
  },
  coverTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 38,
    letterSpacing: -1.1,
    lineHeight: 1.04,
    marginBottom: 16,
  },
  coverSubtitle: {
    color: "#eef2f7",
    fontSize: 15,
    lineHeight: 1.35,
    marginBottom: 36,
    maxWidth: 420,
  },
  coverAuthor: {
    borderTopColor: "rgba(255,255,255,0.55)",
    borderTopWidth: 1,
    fontSize: 11,
    letterSpacing: 1.2,
    paddingTop: 14,
    textTransform: "uppercase",
  },
  header: {
    alignItems: "center",
    borderBottomColor: colors.rule,
    borderBottomWidth: 0.6,
    color: colors.muted,
    display: "flex",
    flexDirection: "row",
    fontSize: 7.5,
    justifyContent: "space-between",
    letterSpacing: 0.7,
    marginBottom: 34,
    paddingBottom: 9,
    textTransform: "uppercase",
  },
  footer: {
    bottom: 22,
    color: colors.muted,
    fontSize: 8,
    left: 58,
    position: "absolute",
    right: 58,
    textAlign: "center",
  },
  tocTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 30,
    letterSpacing: -0.6,
    marginBottom: 10,
  },
  tocIntro: {
    color: colors.muted,
    fontSize: 11,
    marginBottom: 28,
  },
  tocRow: {
    alignItems: "center",
    borderBottomColor: colors.rule,
    borderBottomWidth: 0.5,
    display: "flex",
    flexDirection: "row",
    gap: 12,
    paddingVertical: 9,
  },
  tocNumber: {
    color: colors.teal,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    width: 28,
  },
  tocLink: {
    color: colors.ink,
    flexGrow: 1,
    fontSize: 11,
    textDecoration: "none",
  },
  chapterNumber: {
    color: colors.teal,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    letterSpacing: 1.8,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  chapterTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 27,
    letterSpacing: -0.5,
    lineHeight: 1.12,
    marginBottom: 13,
  },
  chapterIntro: {
    borderLeftColor: colors.accent,
    borderLeftWidth: 3,
    color: "#38445b",
    fontSize: 12,
    lineHeight: 1.5,
    marginBottom: 28,
    paddingLeft: 14,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 15,
    lineHeight: 1.25,
    marginBottom: 9,
    marginTop: 4,
  },
  paragraph: {
    marginBottom: 9,
    orphans: 3,
    widows: 3,
  },
  bulletRow: {
    display: "flex",
    flexDirection: "row",
    gap: 9,
    marginBottom: 5,
    paddingLeft: 7,
  },
  bullet: {
    color: colors.teal,
    fontFamily: "Helvetica-Bold",
    width: 8,
  },
  bulletText: {
    flexGrow: 1,
  },
  takeaway: {
    backgroundColor: "#edf6f3",
    borderLeftColor: colors.teal,
    borderLeftWidth: 3,
    marginTop: 8,
    padding: 12,
  },
  takeawayLabel: {
    color: colors.teal,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    letterSpacing: 1.1,
    marginBottom: 4,
    textTransform: "uppercase",
  },
});

function chapterId(index: number) {
  return `chapter-${index + 1}`;
}

function PageChrome({ title }: { readonly title: string }) {
  return (
    <>
      <View fixed style={styles.header}>
        <Text>{title}</Text>
        <Text>Practical guide</Text>
      </View>
      <Text
        fixed
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        style={styles.footer}
      />
    </>
  );
}

function CoverArtwork() {
  return (
    <Svg height="100%" viewBox="0 0 612 792" width="100%">
      <Rect fill="#14213d" height="792" width="612" x="0" y="0" />
      <Circle cx="495" cy="132" fill="#f4a261" opacity="0.94" r="154" />
      <Circle cx="118" cy="540" fill="#2a9d8f" opacity="0.78" r="214" />
      <Circle cx="538" cy="694" fill="#e9c46a" opacity="0.4" r="116" />
      <Rect fill="#ffffff" height="440" opacity="0.06" width="54" x="368" y="182" />
    </Svg>
  );
}

export function EbookDocument({
  book,
  coverDataUrl,
}: {
  readonly book: Ebook;
  readonly coverDataUrl?: string;
}) {
  return (
    <Document
      author={book.author}
      subject={book.description}
      title={book.title}
    >
      <Page size="LETTER" style={styles.cover}>
        {coverDataUrl ? (
          <Image src={coverDataUrl} style={styles.coverImage} />
        ) : (
          <CoverArtwork />
        )}
        <View style={styles.coverOverlay} />
        <View style={styles.coverContent}>
          <Text style={styles.coverEyebrow}>A focused field guide</Text>
          <Text style={styles.coverTitle}>{book.title}</Text>
          {book.subtitle ? <Text style={styles.coverSubtitle}>{book.subtitle}</Text> : null}
          <Text style={styles.coverAuthor}>{book.author}</Text>
        </View>
      </Page>

      <Page size="LETTER" style={styles.page}>
        <PageChrome title={book.title} />
        <Text style={styles.tocTitle}>Contents</Text>
        <Text style={styles.tocIntro}>{book.description}</Text>
        {book.chapters.map((chapter, index) => (
          <View key={chapterId(index)} style={styles.tocRow}>
            <Text style={styles.tocNumber}>{String(index + 1).padStart(2, "0")}</Text>
            <Link src={`#${chapterId(index)}`} style={styles.tocLink}>
              {chapter.title}
            </Link>
          </View>
        ))}
      </Page>

      {book.chapters.map((chapter, chapterIndex) => (
        <Page id={chapterId(chapterIndex)} key={chapterId(chapterIndex)} size="LETTER" style={styles.page}>
          <PageChrome title={book.title} />
          <Text style={styles.chapterNumber}>Chapter {chapterIndex + 1}</Text>
          <Text style={styles.chapterTitle}>{chapter.title}</Text>
          <Text style={styles.chapterIntro}>{chapter.introduction}</Text>

          {chapter.sections.map((section, sectionIndex) => (
            <View key={`${chapterId(chapterIndex)}-section-${sectionIndex + 1}`} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.heading}</Text>
              {section.paragraphs.map((paragraph, paragraphIndex) => (
                <Text key={`paragraph-${paragraphIndex + 1}`} style={styles.paragraph}>
                  {paragraph}
                </Text>
              ))}
              {section.bullets?.map((bullet, bulletIndex) => (
                <View key={`bullet-${bulletIndex + 1}`} style={styles.bulletRow} wrap={false}>
                  <Text style={styles.bullet}>•</Text>
                  <Text style={styles.bulletText}>{bullet}</Text>
                </View>
              ))}
              {section.takeaway ? (
                <View style={styles.takeaway} wrap={false}>
                  <Text style={styles.takeawayLabel}>Key takeaway</Text>
                  <Text>{section.takeaway}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </Page>
      ))}
    </Document>
  );
}
