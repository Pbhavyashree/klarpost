import type { GermanState } from "../src/core/dates";

/**
 * Fictional sample letters with hand-checked answers. Every name, address,
 * number and IBAN here is invented (the IBANs only have valid checksums so the
 * detector treats them like real ones). Add new cases whenever a real-world
 * letter trips the system up: that is how the accuracy numbers stay honest.
 */
export interface EvalLetter {
  id: string;
  description: string;
  state: GermanState;
  text: string;
  expected: {
    letterDate: string;
    /** Final due dates (after deadline maths). */
    deadlines: string[];
    amountsCents: number[];
    references: string[];
  };
  /** Strings that must never appear in what is sent to the AI. */
  pii: string[];
}

export const LETTERS: EvalLetter[] = [
  {
    id: "tax-assessment",
    description: "Finanzamt: income tax assessment with back payment and objection period",
    state: "BE",
    text: `Finanzamt Musterbezirk
Musterplatz 1, 10999 Berlin

Frau Lena Hoffmann
Lindenstraße 41
10969 Berlin

Steuernummer: 13/456/78901
Datum: 30.10.2026

Bescheid für 2025 über Einkommensteuer

Sehr geehrte Frau Hoffmann,
die Einkommensteuer für 2025 wird auf 4.812,00 EUR festgesetzt. Nach Abzug der Vorauszahlungen ergibt sich eine Nachzahlung von 1.234,56 EUR.
Bitte zahlen Sie den Betrag bis zum 07.12.2026 auf das Konto IBAN DE46 1005 0000 1234 5678 90 der Landeshauptkasse.

Rechtsbehelfsbelehrung
Gegen diesen Bescheid ist der Einspruch zulässig. Er ist innerhalb eines Monats nach Bekanntgabe dieses Bescheides beim Finanzamt Musterbezirk einzulegen.

Mit freundlichen Grüßen
Ihr Finanzamt`,
    expected: {
      letterDate: "2026-10-30",
      deadlines: ["2026-12-07", "2026-12-03"],
      amountsCents: [123456],
      references: ["13/456/78901"],
    },
    pii: ["Lena", "Hoffmann", "Lindenstraße 41", "10969 Berlin", "13/456/78901", "DE46 1005 0000 1234 5678 90"],
  },
  {
    id: "health-insurance-arrears",
    description: "Krankenkasse: contribution arrears with a late fee",
    state: "BE",
    text: `Musterkrankenkasse
Postfach 1234, 20001 Hamburg

Herrn Jonas Weber
Kastanienallee 7
10435 Berlin

Berlin, 28.10.2026
Mitgliedsnummer: A123456789

Beitragsrückstand

Sehr geehrter Herr Weber,
leider konnten wir für die Monate August und September 2026 keinen Zahlungseingang feststellen.
Offener Betrag: 312,90 EUR
Säumniszuschlag: 6,00 EUR
Bitte überweisen Sie den Gesamtbetrag spätestens bis 16.11.2026.
Bei Fragen erreichen Sie uns unter Tel. 040 9876543.

Freundliche Grüße
Ihre Musterkrankenkasse`,
    expected: {
      letterDate: "2026-10-28",
      deadlines: ["2026-11-16"],
      amountsCents: [31290, 600],
      references: ["A123456789"],
    },
    pii: ["Jonas", "Weber", "Kastanienallee 7", "10435 Berlin"],
  },
  {
    id: "broadcast-fee-assessment",
    description: "Broadcasting fee: formal assessment with objection period ending on a Sunday",
    state: "BE",
    text: `Rundfunkbeitrag-Beitragsservice (Beispiel)
50656 Köln

Frau Priya Nair
Am Friedrichshain 22
10407 Berlin

Köln, den 02.11.2026
Beitragsnummer: 123 456 789

Festsetzungsbescheid

Sehr geehrte Frau Nair,
für den Zeitraum 01.04.2026 bis 30.09.2026 werden rückständige Rundfunkbeiträge in Höhe von 220,32 Euro festgesetzt. Zusätzlich wird ein Säumniszuschlag von 8,00 Euro festgesetzt.
Gegen diesen Bescheid können Sie innerhalb eines Monats nach Bekanntgabe Widerspruch erheben.

Mit freundlichen Grüßen`,
    expected: {
      letterDate: "2026-11-02",
      deadlines: ["2026-12-07"],
      amountsCents: [22032, 800],
      references: ["123 456 789"],
    },
    pii: ["Priya", "Nair", "Am Friedrichshain 22", "10407 Berlin"],
  },
  {
    id: "immigration-appointment",
    description: "Immigration office: appointment invitation with documents to bring",
    state: "BE",
    text: `Landesamt für Einwanderung (Beispiel)
Musterdamm 10, 13353 Berlin

Herrn Arjun Rao
Seestraße 101
13353 Berlin

Berlin, 21.10.2026
Vorgangsnummer: VG-2026-77812

Einladung zur persönlichen Vorsprache

Sehr geehrter Herr Rao,
zur Bearbeitung Ihres Antrags laden wir Sie zu einem persönlichen Termin ein.
Ihr Termin: Mittwoch, 18.11.2026, 09:30 Uhr, Raum 214.
Bitte bringen Sie Ihren Reisepass, ein aktuelles biometrisches Foto und Ihren Arbeitsvertrag mit.
Falls Sie den Termin nicht wahrnehmen können, sagen Sie ihn bitte rechtzeitig ab.

Mit freundlichen Grüßen`,
    expected: {
      letterDate: "2026-10-21",
      deadlines: ["2026-11-18"],
      amountsCents: [],
      references: ["VG-2026-77812"],
    },
    pii: ["Arjun", "Rao", "Seestraße 101"],
  },
  {
    id: "jobcenter-documents",
    description: "Jobcenter: missing documents, with a benefit period that is NOT a deadline",
    state: "BE",
    text: `Jobcenter Berlin Beispielbezirk
Beispielweg 5, 12043 Berlin

Frau Sofia Romano
Hermannstraße 230
12049 Berlin

Datum: 27.10.2026
Kundennummer: 123D456789

Aufforderung zur Mitwirkung

Sehr geehrte Frau Romano,
für Ihren Weiterbewilligungsantrag für den Bewilligungszeitraum 01.12.2026 bis 31.05.2027 fehlen noch Unterlagen.
Bitte reichen Sie die Kontoauszüge der letzten drei Monate und den aktuellen Mietvertrag bis zum 25.11.2026 ein.
Rückfragen per E-Mail an sofia.romano@example.net werden nicht beantwortet; nutzen Sie bitte das Online-Postfach.

Mit freundlichen Grüßen`,
    expected: {
      letterDate: "2026-10-27",
      deadlines: ["2026-11-25"],
      amountsCents: [],
      references: ["123D456789"],
    },
    pii: ["Sofia", "Romano", "Hermannstraße 230", "12049 Berlin", "sofia.romano@example.net"],
  },
  {
    id: "landlord-utilities",
    description: "Landlord: annual utilities statement with a back payment",
    state: "BE",
    text: `Hausverwaltung Beispiel GmbH
Ringstraße 3, 10115 Berlin

Herrn Tomasz Nowak
Schönhauser Allee 150
10435 Berlin

Berlin, 20.10.2026

Betriebskostenabrechnung 2025

Sehr geehrter Herr Nowak,
anbei erhalten Sie die Betriebskostenabrechnung für den Abrechnungszeitraum 01.01.2025 bis 31.12.2025.
Ihre Vorauszahlungen betrugen 1.800,00 EUR, die tatsächlichen Kosten 2.212,18 EUR.
Es ergibt sich eine Nachzahlung von 412,18 €.
Bitte überweisen Sie den Betrag bis zum 30.11.2026 auf unser Konto IBAN DE95 3705 0198 0004 4556 61.

Mit freundlichen Grüßen
Hausverwaltung Beispiel GmbH`,
    expected: {
      letterDate: "2026-10-20",
      deadlines: ["2026-11-30"],
      amountsCents: [41218],
      references: [],
    },
    pii: ["Tomasz", "Nowak", "Schönhauser Allee 150", "DE95 3705 0198 0004 4556 61"],
  },
  {
    id: "traffic-warning-fine",
    description: "Ordnungsamt: warning fine payable within one week of receipt",
    state: "BE",
    text: `Bezirksamt Beispiel von Berlin – Ordnungsamt
Beispielstraße 1, 10551 Berlin

Frau Mei Chen
Turmstraße 12
10559 Berlin

Berlin, 05.11.2026
Aktenzeichen: 51.2-OWi-2026-118833

Verwarnung mit Verwarnungsgeld

Sehr geehrte Frau Chen,
Ihnen wird vorgeworfen, am 29.10.2026 im eingeschränkten Halteverbot geparkt zu haben.
Das Verwarnungsgeld beträgt 35,00 EUR. Bitte zahlen Sie den Betrag binnen einer Woche nach Zugang dieses Schreibens.
Zahlen Sie nicht fristgerecht, wird ein Bußgeldverfahren eingeleitet.

Mit freundlichen Grüßen`,
    expected: {
      letterDate: "2026-11-05",
      deadlines: ["2026-11-16"],
      amountsCents: [3500],
      references: ["51.2-OWi-2026-118833"],
    },
    pii: ["Mei", "Chen", "Turmstraße 12", "10559 Berlin"],
  },
  {
    id: "utility-reminder",
    description: "Energy supplier: payment reminder with a reminder fee",
    state: "BE",
    text: `Stadtwerke Beispielstadt
Kundenservice

Herrn David Okafor
Kiefholzstraße 9
12435 Berlin

Beispielstadt, den 3. November 2026
Rechnungsnummer: RE-2026-004471

Zahlungserinnerung

Sehr geehrter Herr Okafor,
zu Ihrer Rechnung ist noch ein Betrag offen.
Offener Betrag: 98,70 €
Mahngebühr: 5,00 €
Gesamtbetrag: 103,70 €
Zahlbar bis 12.11.2026 auf IBAN DE75 1203 0000 1020 3040 50.

Mit freundlichen Grüßen
Ihre Stadtwerke`,
    expected: {
      letterDate: "2026-11-03",
      deadlines: ["2026-11-12"],
      amountsCents: [10370, 9870, 500],
      references: ["RE-2026-004471"],
    },
    pii: ["David", "Okafor", "Kiefholzstraße 9", "12435 Berlin", "DE75 1203 0000 1020 3040 50"],
  },
  // The two letters below use phrasing the rules engine was NOT written for.
  // They keep the evaluation honest: patterns only go so far.
  {
    id: "university-reenrolment",
    description: "University: re-enrolment fee with an unusual deadline phrasing",
    state: "BE",
    text: `Beispiel-Universität Berlin – Studierendenservice

Frau Hana Kim
Gotenstraße 18
10829 Berlin

Berlin, 02.11.2026
Matrikelnummer: 5512093

Rückmeldung zum Sommersemester 2027

Liebe Studierende,
der Semesterbeitrag beläuft sich auf 312,50 €. Die Rückmeldefrist endet am 15.01.2027. Wer die Frist versäumt, wird exmatrikuliert.

Ihr Studierendenservice`,
    expected: {
      letterDate: "2026-11-02",
      deadlines: ["2027-01-15"],
      amountsCents: [31250],
      references: [],
    },
    pii: ["Hana", "Kim", "Gotenstraße 18", "10829 Berlin"],
  },
  {
    id: "family-benefit-form",
    description: "Familienkasse: return a form 'within the next four weeks'",
    state: "BE",
    text: `Familienkasse Beispiel
Beispielring 4, 10117 Berlin

Herrn Lucas Martin
Wühlischstraße 33
10245 Berlin

Berlin, 26.10.2026

Überprüfung Ihres Kindergeldanspruchs

Sehr geehrter Herr Martin,
wir überprüfen regelmäßig, ob die Voraussetzungen für das Kindergeld weiterhin erfüllt sind.
Senden Sie uns den beiliegenden Vordruck bitte ausgefüllt innerhalb der nächsten vier Wochen zurück. Andernfalls müssen wir die Zahlung des Kindergeldes einstellen.

Mit freundlichen Grüßen
Ihre Familienkasse`,
    expected: {
      letterDate: "2026-10-26",
      deadlines: ["2026-11-27"],
      amountsCents: [],
      references: [],
    },
    pii: ["Lucas", "Martin", "Wühlischstraße 33", "10245 Berlin"],
  },
];
