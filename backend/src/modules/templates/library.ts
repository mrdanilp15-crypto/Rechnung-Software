import type { DocType, EmailKind } from "./render";

/**
 * Bibliothek fertiger Formulierungen zum Ausprobieren: dieselben Anlässe in mehreren Tonlagen (förmlich, freundlich, kurz, persönlich).
 * Beides sind nur Vorschläge - nichts davon wird automatisch verwendet. Der Nutzer sieht sie im Versanddialog, im Belegeditor und in den
 * Einstellungen und übernimmt, was am besten klingt (danach frei änderbar). Es kommen nur bekannte Platzhalter vor ({kunde}, {nummer} ...);
 * die Versandplatzhalter nur im Versandbescheid. Die gesetzlichen Pflichthinweise (z.B. Kleinunternehmer) fügt die PDF-Vorlage selbst hinzu.
 */

export interface EmailVariant {
  kind: EmailKind;
  name: string;
  subject: string;
  body: string;
}

export interface DocTextVariant {
  docType: DocType;
  name: string;
  intro: string;
  closing: string;
}

const FORMAL = "Förmlich";
const FRIENDLY = "Freundlich";
const SHORT = "Kurz";
const PERSONAL = "Persönlich";

export const EMAIL_LIBRARY: EmailVariant[] = [
  // ---------- Angebot ----------
  {
    kind: "QUOTE",
    name: FORMAL,
    subject: "Ihr Angebot {nummer}",
    body: "Guten Tag {ansprechpartner},\n\nvielen Dank für Ihre Anfrage. Anbei übersenden wir Ihnen unser Angebot {nummer} über {betrag}, gültig bis {faellig}.\n\nFür Rückfragen oder Änderungswünsche stehen wir Ihnen gern zur Verfügung.\n\nMit freundlichen Grüßen\n{firma}",
  },
  {
    kind: "QUOTE",
    name: FRIENDLY,
    subject: "Ihr Angebot {nummer} von {firma}",
    body: "Hallo {ansprechpartner},\n\nvielen Dank für Ihre Anfrage! Im Anhang finden Sie unser Angebot {nummer} über {betrag}. Es gilt bis {faellig}.\n\nWenn Sie etwas ändern möchten, sagen Sie einfach Bescheid - wir passen das Angebot gern an.\n\nViele Grüße\n{firma}",
  },
  {
    kind: "QUOTE",
    name: SHORT,
    subject: "Angebot {nummer}",
    body: "Hallo {ansprechpartner},\n\nanbei das Angebot {nummer} über {betrag} (gültig bis {faellig}).\n\nFragen gern jederzeit.\n\nBeste Grüße\n{firma}",
  },
  {
    kind: "QUOTE",
    name: PERSONAL,
    subject: "Ihr Angebot {nummer}",
    body: "Hallo {ansprechpartner},\n\nschön, von Ihnen zu hören! Ich habe Ihnen ein Angebot ({nummer}) über {betrag} zusammengestellt. Es liegt als PDF bei und gilt bis {faellig}.\n\nSollte noch etwas offen sein, schreiben Sie mir einfach kurz.\n\nBeste Grüße\n{firma}",
  },
  {
    kind: "QUOTE",
    name: "Nachfassen freundlich",
    subject: "Kurze Nachfrage zu Angebot {nummer}",
    body: "Hallo {ansprechpartner},\n\nich wollte kurz nachfragen, ob Sie unser Angebot {nummer} über {betrag} schon ansehen konnten. Es gilt noch bis {faellig}.\n\nGibt es offene Fragen, oder soll etwas angepasst werden? Ich helfe gern.\n\nViele Grüße\n{firma}",
  },
  {
    kind: "QUOTE",
    name: "Nachfassen förmlich",
    subject: "Angebot {nummer} - Rückfrage",
    body: "Guten Tag {ansprechpartner},\n\nwir möchten uns erkundigen, ob Sie unser Angebot {nummer} vom {datum} prüfen konnten. Offene Fragen beantworten wir gern.\n\nWir würden uns freuen, Ihren Auftrag zu erhalten.\n\nMit freundlichen Grüßen\n{firma}",
  },

  // ---------- Auftragsbestätigung ----------
  {
    kind: "ORDER_CONFIRMATION",
    name: FORMAL,
    subject: "Auftragsbestätigung {nummer}",
    body: "Guten Tag {ansprechpartner},\n\nvielen Dank für Ihren Auftrag. Anbei erhalten Sie die Auftragsbestätigung {nummer} über {betrag}. Wir beginnen mit der Fertigung und informieren Sie, sobald die Ware versendet wird.\n\nMit freundlichen Grüßen\n{firma}",
  },
  {
    kind: "ORDER_CONFIRMATION",
    name: FRIENDLY,
    subject: "Danke für Ihre Bestellung - Auftragsbestätigung {nummer}",
    body: "Hallo {ansprechpartner},\n\nvielen Dank für Ihre Bestellung! Im Anhang ist die Auftragsbestätigung {nummer} über {betrag}. Wir legen direkt los und melden uns, sobald Ihr Paket unterwegs ist.\n\nViele Grüße\n{firma}",
  },
  {
    kind: "ORDER_CONFIRMATION",
    name: SHORT,
    subject: "Auftragsbestätigung {nummer}",
    body: "Hallo {ansprechpartner},\n\nIhr Auftrag ist bestätigt ({nummer}, {betrag}). Details im Anhang. Den Versandbescheid schicken wir, sobald das Paket raus ist.\n\nBeste Grüße\n{firma}",
  },
  {
    kind: "ORDER_CONFIRMATION",
    name: PERSONAL,
    subject: "Ihr Auftrag {nummer} ist bei uns angekommen",
    body: "Hallo {ansprechpartner},\n\nherzlichen Dank für Ihr Vertrauen! Ihren Auftrag {nummer} über {betrag} haben wir aufgenommen, die Bestätigung hängt als PDF an. Ich melde mich, sobald Ihr Paket auf die Reise geht.\n\nHerzliche Grüße\n{firma}",
  },

  // ---------- Lieferschein ----------
  {
    kind: "DELIVERY_NOTE",
    name: FORMAL,
    subject: "Lieferschein {nummer}",
    body: "Guten Tag {ansprechpartner},\n\nanbei übersenden wir Ihnen den Lieferschein {nummer} zu Ihrer Bestellung.\n\nMit freundlichen Grüßen\n{firma}",
  },
  {
    kind: "DELIVERY_NOTE",
    name: FRIENDLY,
    subject: "Ihr Lieferschein {nummer}",
    body: "Hallo {ansprechpartner},\n\nIhre Bestellung ist für Sie bereit. Den Lieferschein {nummer} finden Sie im Anhang.\n\nViele Grüße\n{firma}",
  },
  {
    kind: "DELIVERY_NOTE",
    name: SHORT,
    subject: "Lieferschein {nummer}",
    body: "Hallo {ansprechpartner},\n\nLieferschein {nummer} im Anhang.\n\nBeste Grüße\n{firma}",
  },
  {
    kind: "DELIVERY_NOTE",
    name: PERSONAL,
    subject: "Lieferschein {nummer} zu Ihrer Bestellung",
    body: "Hallo {ansprechpartner},\n\nder Lieferschein {nummer} zu Ihrer Bestellung liegt bei. Bitte schauen Sie nach dem Auspacken kurz, ob alles vollständig und heil angekommen ist - bei Fragen bin ich da.\n\nHerzliche Grüße\n{firma}",
  },

  // ---------- Rechnung ----------
  {
    kind: "INVOICE",
    name: FORMAL,
    subject: "Rechnung {nummer}",
    body: "Guten Tag {ansprechpartner},\n\nvielen Dank für Ihren Auftrag. Anbei erhalten Sie die Rechnung {nummer} über {betrag}. Wir bitten um Überweisung bis zum {faellig}.\n\nMit freundlichen Grüßen\n{firma}",
  },
  {
    kind: "INVOICE",
    name: FRIENDLY,
    subject: "Ihre Rechnung {nummer} von {firma}",
    body: "Hallo {ansprechpartner},\n\nvielen Dank für Ihren Auftrag! Die Rechnung {nummer} über {betrag} finden Sie im Anhang. Bitte überweisen Sie den Betrag bis zum {faellig}.\n\nViele Grüße\n{firma}",
  },
  {
    kind: "INVOICE",
    name: SHORT,
    subject: "Rechnung {nummer}",
    body: "Hallo {ansprechpartner},\n\nRechnung {nummer} über {betrag} im Anhang, zahlbar bis {faellig}.\n\nDanke und beste Grüße\n{firma}",
  },
  {
    kind: "INVOICE",
    name: PERSONAL,
    subject: "Rechnung {nummer} - danke für Ihren Auftrag",
    body: "Hallo {ansprechpartner},\n\nes hat mich gefreut, für Sie zu arbeiten! Die Rechnung {nummer} über {betrag} liegt als PDF bei, fällig bis {faellig}. Wenn Sie wieder etwas brauchen, melden Sie sich einfach.\n\nHerzliche Grüße\n{firma}",
  },
  {
    kind: "INVOICE",
    name: "Zahlungserinnerung freundlich",
    subject: "Zahlungserinnerung zu Rechnung {nummer}",
    body: "Hallo {ansprechpartner},\n\nvielleicht ist es im Alltag untergegangen: Zu unserer Rechnung {nummer} über {betrag} konnten wir noch keinen Zahlungseingang feststellen. Sie war fällig bis {faellig}.\n\nSollten Sie bereits überwiesen haben, betrachten Sie diese Nachricht bitte als gegenstandslos. Andernfalls freuen wir uns über Ihre Überweisung in den nächsten Tagen.\n\nViele Grüße\n{firma}",
  },
  {
    kind: "INVOICE",
    name: "Zahlungserinnerung bestimmt",
    subject: "Erinnerung: Rechnung {nummer} ist noch offen",
    body: "Guten Tag {ansprechpartner},\n\nzu unserer Rechnung {nummer} über {betrag} liegt uns bis heute kein Zahlungseingang vor. Bitte überweisen Sie den offenen Betrag innerhalb der nächsten 7 Tage.\n\nWenn es Rückfragen zur Rechnung gibt, melden Sie sich bitte umgehend bei uns.\n\nMit freundlichen Grüßen\n{firma}",
  },

  // ---------- Versandbescheid ----------
  {
    kind: "SHIPPED",
    name: FORMAL,
    subject: "Ihre Bestellung {nummer} wurde versendet",
    body: "Guten Tag {ansprechpartner},\n\nIhre Bestellung {nummer} haben wir heute versendet.\n\nVersanddienst: {versanddienst}\nSendungsnummer: {sendungsnummer}\nSendungsverfolgung: {sendungslink}\n\nBei Fragen stehen wir Ihnen gern zur Verfügung.\n\nMit freundlichen Grüßen\n{firma}",
  },
  {
    kind: "SHIPPED",
    name: FRIENDLY,
    subject: "Ihr Paket {nummer} ist unterwegs",
    body: "Hallo {ansprechpartner},\n\ngute Nachrichten: Ihre Bestellung {nummer} ist heute zu Ihnen losgeschickt worden!\n\nVersanddienst: {versanddienst}\nSendungsnummer: {sendungsnummer}\nSendungsverfolgung: {sendungslink}\n\nWir wünschen Ihnen viel Freude damit.\n\nViele Grüße\n{firma}",
  },
  {
    kind: "SHIPPED",
    name: SHORT,
    subject: "Bestellung {nummer} versendet",
    body: "Hallo {ansprechpartner},\n\nIhre Bestellung {nummer} ist raus.\n\nVersanddienst: {versanddienst}\nSendungsnummer: {sendungsnummer}\nSendungsverfolgung: {sendungslink}\n\nBeste Grüße\n{firma}",
  },
  {
    kind: "SHIPPED",
    name: PERSONAL,
    subject: "Ihre Bestellung {nummer} hat sich auf den Weg gemacht",
    body: "Hallo {ansprechpartner},\n\nich habe Ihre Bestellung {nummer} heute sorgfältig verpackt und versendet.\n\nVersanddienst: {versanddienst}\nSendungsnummer: {sendungsnummer}\nSendungsverfolgung: {sendungslink}\n\nWenn das Paket angekommen ist, freue ich mich über eine kurze Rückmeldung, ob alles gepasst hat. Bei Problemen melden Sie sich einfach direkt bei mir.\n\nHerzliche Grüße\n{firma}",
  },
];

export const DOC_TEXT_LIBRARY: DocTextVariant[] = [
  // ---------- Angebot ----------
  {
    docType: "QUOTE",
    name: FORMAL,
    intro: "Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihre Anfrage. Gern unterbreiten wir Ihnen folgendes Angebot:",
    closing: "Dieses Angebot ist gültig bis {faellig}. Wir freuen uns auf Ihre Auftragserteilung und stehen für Rückfragen jederzeit zur Verfügung.\n\nMit freundlichen Grüßen\n{firma}",
  },
  {
    docType: "QUOTE",
    name: FRIENDLY,
    intro: "Hallo {ansprechpartner},\n\nvielen Dank für Ihr Interesse! Hier ist Ihr Angebot:",
    closing: "Das Angebot gilt bis {faellig}. Wenn Sie etwas ändern möchten - Farbe, Stückzahl, Größe - sagen Sie einfach Bescheid, wir passen es gern an.\n\nViele Grüße\n{firma}",
  },
  {
    docType: "QUOTE",
    name: SHORT,
    intro: "Guten Tag,\n\nwie besprochen unser Angebot:",
    closing: "Angebot gültig bis {faellig}. Bei Fragen einfach melden.\n\nBeste Grüße\n{firma}",
  },
  {
    docType: "QUOTE",
    name: PERSONAL,
    intro: "Hallo {ansprechpartner},\n\nschön, dass Sie an uns gedacht haben! Wir fertigen Ihre Teile mit Sorgfalt - hier das Angebot dazu:",
    closing: "Das Angebot gilt bis {faellig}. Wenn noch etwas offen ist, sprechen Sie uns gern an - wir finden eine Lösung.\n\nHerzliche Grüße\n{firma}",
  },

  // ---------- Auftragsbestätigung ----------
  {
    docType: "ORDER_CONFIRMATION",
    name: FORMAL,
    intro: "Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihren Auftrag. Wir bestätigen Ihnen hiermit folgende Positionen:",
    closing: "Wir beginnen mit der Fertigung und informieren Sie, sobald die Ware versendet wird. Bei Rückfragen stehen wir Ihnen gern zur Verfügung.\n\nMit freundlichen Grüßen\n{firma}",
  },
  {
    docType: "ORDER_CONFIRMATION",
    name: FRIENDLY,
    intro: "Hallo {ansprechpartner},\n\nvielen Dank für Ihre Bestellung! Wir haben alles notiert und bestätigen Ihnen:",
    closing: "Wir legen direkt los und melden uns, sobald Ihr Paket auf dem Weg ist. Falls noch etwas angepasst werden soll, schreiben Sie uns bitte zeitnah.\n\nViele Grüße\n{firma}",
  },
  {
    docType: "ORDER_CONFIRMATION",
    name: SHORT,
    intro: "Guten Tag,\n\nhiermit bestätigen wir Ihren Auftrag:",
    closing: "Wir melden uns, sobald die Ware versendet ist.\n\nBeste Grüße\n{firma}",
  },
  {
    docType: "ORDER_CONFIRMATION",
    name: PERSONAL,
    intro: "Hallo {ansprechpartner},\n\nherzlichen Dank für Ihr Vertrauen! Ihr Auftrag ist bei uns eingegangen:",
    closing: "Wir kümmern uns jetzt um die Umsetzung und halten Sie auf dem Laufenden. Bei Fragen erreichen Sie uns jederzeit.\n\nHerzliche Grüße\n{firma}",
  },

  // ---------- Lieferschein ----------
  {
    docType: "DELIVERY_NOTE",
    name: FORMAL,
    intro: "Sehr geehrte Damen und Herren,\n\nwir liefern Ihnen folgende Positionen:",
    closing: "Bitte prüfen Sie die Lieferung auf Vollständigkeit und Unversehrtheit. Beanstandungen teilen Sie uns bitte umgehend mit.\n\nMit freundlichen Grüßen\n{firma}",
  },
  {
    docType: "DELIVERY_NOTE",
    name: FRIENDLY,
    intro: "Hallo {ansprechpartner},\n\nIhr Paket ist da! Es enthält:",
    closing: "Bitte schauen Sie nach dem Auspacken kurz, ob alles vollständig und heil angekommen ist. Falls nicht, melden Sie sich bitte gleich bei uns - wir kümmern uns darum.\n\nViele Grüße\n{firma}",
  },
  {
    docType: "DELIVERY_NOTE",
    name: SHORT,
    intro: "Guten Tag,\n\nIhre Lieferung enthält:",
    closing: "Bitte auf Vollständigkeit prüfen.\n\nBeste Grüße\n{firma}",
  },
  {
    docType: "DELIVERY_NOTE",
    name: PERSONAL,
    intro: "Hallo {ansprechpartner},\n\nvielen Dank für Ihren Auftrag - hier kommt Ihre Bestellung:",
    closing: "Wir hoffen, dass alles Ihren Vorstellungen entspricht. Wenn etwas nicht passt, sagen Sie uns einfach Bescheid.\n\nHerzliche Grüße\n{firma}",
  },

  // ---------- Rechnung ----------
  {
    docType: "INVOICE",
    name: FORMAL,
    intro: "Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihren Auftrag. Für die erbrachte Lieferung stellen wir Ihnen folgenden Betrag in Rechnung:",
    closing: "Bitte überweisen Sie den Rechnungsbetrag bis zum {faellig} unter Angabe der Rechnungsnummer {nummer} auf das unten genannte Konto.\n\nMit freundlichen Grüßen\n{firma}",
  },
  {
    docType: "INVOICE",
    name: FRIENDLY,
    intro: "Hallo {ansprechpartner},\n\nvielen Dank für Ihren Auftrag! Hier ist die Rechnung dazu:",
    closing: "Bitte überweisen Sie {betrag} bis zum {faellig} und geben Sie dabei {nummer} an. Danke!\n\nViele Grüße\n{firma}",
  },
  {
    docType: "INVOICE",
    name: SHORT,
    intro: "Guten Tag,\n\nwir berechnen wie folgt:",
    closing: "Zahlbar bis {faellig} unter Angabe von {nummer}.\n\nBeste Grüße\n{firma}",
  },
  {
    docType: "INVOICE",
    name: PERSONAL,
    intro: "Hallo {ansprechpartner},\n\nes war uns eine Freude, für Sie zu arbeiten. Hier die Rechnung:",
    closing: "Wir freuen uns über die Überweisung von {betrag} bis zum {faellig} (Verwendungszweck {nummer}). Und wenn Sie wieder etwas brauchen - wir sind gern für Sie da.\n\nHerzliche Grüße\n{firma}",
  },
];
