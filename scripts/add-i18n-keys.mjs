/**
 * HOUSE-ZEN — injects the customer-identity / reservation-times / apartment
 * i18n keys into every locale file (fr, en, de, it, es, sw, ar), anchored
 * after existing keys. Idempotent: skips keys already present.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const LOCALES = {
  fr: {
    customers: [
      ["'customers.idType': 'Type de pièce',"],
      ["'customers.idType.CNI': 'CNI',"],
      ["'customers.idType.PASSEPORT': 'Passeport',"],
      ["'customers.idType.PERMIS': 'Permis de conduire',"],
      ["'customers.idType.RECEPISSE': 'Récépissé',"],
      ["'customers.idIssued': 'Délivrée le',"],
      ["'customers.idIssueDate': 'Date de délivrance',"],
      ["'customers.idIssuePlace': 'Lieu de délivrance',"],
      ["'customers.detail.title': 'Fiche client',"],
      ["'customers.detail.back': 'Retour aux clients',"],
      ["'customers.detail.notFound': 'Client introuvable',"],
      ["'customers.detail.identity': 'Identité',"],
      ["'customers.detail.clientSince': 'Premier enregistrement',"],
      ["'customers.detail.clientSinceHint': 'Date du premier passage dans l’établissement',"],
      ["'customers.detail.stays': 'Séjours',"],
      ["'customers.detail.nights': 'Nuits cumulées',"],
      ["'customers.detail.spent': 'Total dépensé',"],
      ["'customers.detail.history': 'Historique des passages',"],
      ["'customers.detail.historyHint': 'Dates, heures et durées de chaque séjour',"],
      ["'customers.detail.nightsShort': 'Nuits',"],
      ["'customers.detail.noStays': 'Aucun passage enregistré',"],
      ["'customers.detail.firstRegistration': 'Premier enregistrement',"],
    ],
    reservations: [
      ["'reservations.checkInTime': 'Heure d’arrivée',"],
      ["'reservations.checkOutTime': 'Heure de départ',"],
    ],
    rooms: [
      ["'rooms.building': 'Bâtiment',"],
      ["'rooms.parentRoom': 'Appartement',"],
    ],
    roomTypes: [
      ["'roomTypes.kind': 'Nature',"],
      ["'roomTypes.kind.ROOM': 'Chambre',"],
      ["'roomTypes.kind.APARTMENT': 'Appartement meublé',"],
    ],
  },
  en: {
    customers: [
      ["'customers.idType': 'ID type',"],
      ["'customers.idType.CNI': 'National ID card',"],
      ["'customers.idType.PASSEPORT': 'Passport',"],
      ["'customers.idType.PERMIS': 'Driving licence',"],
      ["'customers.idType.RECEPISSE': 'Acknowledgment receipt',"],
      ["'customers.idIssued': 'Issued on',"],
      ["'customers.idIssueDate': 'Issue date',"],
      ["'customers.idIssuePlace': 'Issue place',"],
      ["'customers.detail.title': 'Customer profile',"],
      ["'customers.detail.back': 'Back to customers',"],
      ["'customers.detail.notFound': 'Customer not found',"],
      ["'customers.detail.identity': 'Identity',"],
      ["'customers.detail.clientSince': 'First registration',"],
      ["'customers.detail.clientSinceHint': 'Date of the first stay at the property',"],
      ["'customers.detail.stays': 'Stays',"],
      ["'customers.detail.nights': 'Total nights',"],
      ["'customers.detail.spent': 'Total spent',"],
      ["'customers.detail.history': 'Stay history',"],
      ["'customers.detail.historyHint': 'Dates, times and length of every stay',"],
      ["'customers.detail.nightsShort': 'Nights',"],
      ["'customers.detail.noStays': 'No stays recorded',"],
      ["'customers.detail.firstRegistration': 'First stay',"],
    ],
    reservations: [
      ["'reservations.checkInTime': 'Arrival time',"],
      ["'reservations.checkOutTime': 'Departure time',"],
    ],
    rooms: [
      ["'rooms.building': 'Building',"],
      ["'rooms.parentRoom': 'Apartment unit',"],
    ],
    roomTypes: [
      ["'roomTypes.kind': 'Kind',"],
      ["'roomTypes.kind.ROOM': 'Room',"],
      ["'roomTypes.kind.APARTMENT': 'Furnished apartment',"],
    ],
  },
  de: {
    customers: [
      ["'customers.idType': 'Ausweisart',"],
      ["'customers.idType.CNI': 'Personalausweis',"],
      ["'customers.idType.PASSEPORT': 'Reisepass',"],
      ["'customers.idType.PERMIS': 'Führerschein',"],
      ["'customers.idType.RECEPISSE': 'Vorläufiger Beleg',"],
      ["'customers.idIssued': 'Ausgestellt am',"],
      ["'customers.idIssueDate': 'Ausstellungsdatum',"],
      ["'customers.idIssuePlace': 'Ausstellungsort',"],
      ["'customers.detail.title': 'Kundenprofil',"],
      ["'customers.detail.back': 'Zurück zu den Kunden',"],
      ["'customers.detail.notFound': 'Kunde nicht gefunden',"],
      ["'customers.detail.identity': 'Identität',"],
      ["'customers.detail.clientSince': 'Erste Registrierung',"],
      ["'customers.detail.clientSinceHint': 'Datum des ersten Aufenthalts in der Unterkunft',"],
      ["'customers.detail.stays': 'Aufenthalte',"],
      ["'customers.detail.nights': 'Nächte gesamt',"],
      ["'customers.detail.spent': 'Gesamtausgaben',"],
      ["'customers.detail.history': 'Aufenthaltsverlauf',"],
      ["'customers.detail.historyHint': 'Daten, Uhrzeiten und Dauer jedes Aufenthalts',"],
      ["'customers.detail.nightsShort': 'Nächte',"],
      ["'customers.detail.noStays': 'Keine Aufenthalte erfasst',"],
      ["'customers.detail.firstRegistration': 'Erster Aufenthalt',"],
    ],
    reservations: [
      ["'reservations.checkInTime': 'Ankunftszeit',"],
      ["'reservations.checkOutTime': 'Abreisezeit',"],
    ],
    rooms: [
      ["'rooms.building': 'Gebäude',"],
      ["'rooms.parentRoom': 'Apartment-Einheit',"],
    ],
    roomTypes: [
      ["'roomTypes.kind': 'Art',"],
      ["'roomTypes.kind.ROOM': 'Zimmer',"],
      ["'roomTypes.kind.APARTMENT': 'Möbliertes Apartment',"],
    ],
  },
  it: {
    customers: [
      ["'customers.idType': 'Tipo di documento',"],
      ["'customers.idType.CNI': " + "'Carta d\u2019identità',"],
      ["'customers.idType.PASSEPORT': 'Passaporto',"],
      ["'customers.idType.PERMIS': 'Patente di guida',"],
      ["'customers.idType.RECEPISSE': 'Ricevuta provvisoria',"],
      ["'customers.idIssued': 'Rilasciato il',"],
      ["'customers.idIssueDate': 'Data di rilascio',"],
      ["'customers.idIssuePlace': 'Luogo di rilascio',"],
      ["'customers.detail.title': 'Scheda cliente',"],
      ["'customers.detail.back': 'Torna ai clienti',"],
      ["'customers.detail.notFound': 'Cliente non trovato',"],
      ["'customers.detail.identity': 'Identità',"],
      ["'customers.detail.clientSince': 'Prima registrazione',"],
      ["'customers.detail.clientSinceHint': 'Data del primo soggiorno nella struttura',"],
      ["'customers.detail.stays': 'Soggiorni',"],
      ["'customers.detail.nights': 'Notti totali',"],
      ["'customers.detail.spent': 'Totale speso',"],
      ["'customers.detail.history': 'Cronologia dei soggiorni',"],
      ["'customers.detail.historyHint': 'Date, orari e durata di ogni soggiorno',"],
      ["'customers.detail.nightsShort': 'Notti',"],
      ["'customers.detail.noStays': 'Nessun soggiorno registrato',"],
      ["'customers.detail.firstRegistration': 'Prima visita',"],
    ],
    reservations: [
      ["'reservations.checkInTime': 'Orario di arrivo',"],
      ["'reservations.checkOutTime': 'Orario di partenza',"],
    ],
    rooms: [
      ["'rooms.building': 'Edificio',"],
      ["'rooms.parentRoom': 'Unità abitativa',"],
    ],
    roomTypes: [
      ["'roomTypes.kind': 'Tipo',"],
      ["'roomTypes.kind.ROOM': 'Camera',"],
      ["'roomTypes.kind.APARTMENT': 'Appartamento arredato',"],
    ],
  },
  es: {
    customers: [
      ["'customers.idType': 'Tipo de documento',"],
      ["'customers.idType.CNI': 'Carné de identidad',"],
      ["'customers.idType.PASSEPORT': 'Pasaporte',"],
      ["'customers.idType.PERMIS': 'Licencia de conducir',"],
      ["'customers.idType.RECEPISSE': 'Comprobante provisional',"],
      ["'customers.idIssued': 'Emitido el',"],
      ["'customers.idIssueDate': 'Fecha de emisión',"],
      ["'customers.idIssuePlace': 'Lugar de emisión',"],
      ["'customers.detail.title': 'Ficha del cliente',"],
      ["'customers.detail.back': 'Volver a los clientes',"],
      ["'customers.detail.notFound': 'Cliente no encontrado',"],
      ["'customers.detail.identity': 'Identidad',"],
      ["'customers.detail.clientSince': 'Primer registro',"],
      ["'customers.detail.clientSinceHint': 'Fecha de la primera estancia en el establecimiento',"],
      ["'customers.detail.stays': 'Estancias',"],
      ["'customers.detail.nights': 'Noches acumuladas',"],
      ["'customers.detail.spent': 'Total gastado',"],
      ["'customers.detail.history': 'Historial de estancias',"],
      ["'customers.detail.historyHint': 'Fechas, horas y duración de cada estancia',"],
      ["'customers.detail.nightsShort': 'Noches',"],
      ["'customers.detail.noStays': 'No hay estancias registradas',"],
      ["'customers.detail.firstRegistration': 'Primera estancia',"],
    ],
    reservations: [
      ["'reservations.checkInTime': 'Hora de llegada',"],
      ["'reservations.checkOutTime': 'Hora de salida',"],
    ],
    rooms: [
      ["'rooms.building': 'Edificio',"],
      ["'rooms.parentRoom': 'Unidad de apartamento',"],
    ],
    roomTypes: [
      ["'roomTypes.kind': 'Naturaleza',"],
      ["'roomTypes.kind.ROOM': 'Habitación',"],
      ["'roomTypes.kind.APARTMENT': 'Apartamento amueblado',"],
    ],
  },
  sw: {
    customers: [
      ["'customers.idType': 'Aina ya kitambulisho',"],
      ["'customers.idType.CNI': 'Kitambulisho cha taifa',"],
      ["'customers.idType.PASSEPORT': 'Pasipoti',"],
      ["'customers.idType.PERMIS': 'Leseni ya udereva',"],
      ["'customers.idType.RECEPISSE': 'Risiti',"],
      ["'customers.idIssued': 'Ilitolewa tarehe',"],
      ["'customers.idIssueDate': 'Tarehe ya kutoleshwa',"],
      ["'customers.idIssuePlace': 'Mahali pa kutoleshwa',"],
      ["'customers.detail.title': 'Wasifu wa mteja',"],
      ["'customers.detail.back': 'Rudi kwa wateja',"],
      ["'customers.detail.notFound': 'Mteja hakupatikana',"],
      ["'customers.detail.identity': 'Utambulisho',"],
      ["'customers.detail.clientSince': 'Usajili wa kwanza',"],
      ["'customers.detail.clientSinceHint': 'Tarehe ya kwanza ya kufika katika taasisi',"],
      ["'customers.detail.stays': 'Malazi',"],
      ["'customers.detail.nights': 'Usiku kwa jumla',"],
      ["'customers.detail.spent': 'Jumla iliyotumika',"],
      ["'customers.detail.history': 'Historia ya malazi',"],
      ["'customers.detail.historyHint': 'Tarehe, saa na muda wa kila malazi',"],
      ["'customers.detail.nightsShort': 'Usiku',"],
      ["'customers.detail.noStays': 'Hakuna malazi yaliyorekodiwa',"],
      ["'customers.detail.firstRegistration': 'Malazi ya kwanza',"],
    ],
    reservations: [
      ["'reservations.checkInTime': 'Saa ya kufika',"],
      ["'reservations.checkOutTime': 'Saa ya kuondoka',"],
    ],
    rooms: [
      ["'rooms.building': 'Jengo',"],
      ["'rooms.parentRoom': 'Apamento',"],
    ],
    roomTypes: [
      ["'roomTypes.kind': 'Aina',"],
      ["'roomTypes.kind.ROOM': 'Chumba',"],
      ["'roomTypes.kind.APARTMENT': 'Apamento iliyo na samani',"],
    ],
  },
  ar: {
    customers: [
      ["'customers.idType': 'نوع الوثيقة',"],
      ["'customers.idType.CNI': 'بطاقة الهوية',"],
      ["'customers.idType.PASSEPORT': 'جواز السفر',"],
      ["'customers.idType.PERMIS': 'رخصة القيادة',"],
      ["'customers.idType.RECEPISSE': 'وصل مؤقت',"],
      ["'customers.idIssued': 'صادرة في',"],
      ["'customers.idIssueDate': 'تاريخ الإصدار',"],
      ["'customers.idIssuePlace': 'مكان الإصدار',"],
      ["'customers.detail.title': 'ملف العميل',"],
      ["'customers.detail.back': 'العودة إلى العملاء',"],
      ["'customers.detail.notFound': 'العميل غير موجود',"],
      ["'customers.detail.identity': 'الهوية',"],
      ["'customers.detail.clientSince': 'أول تسجيل',"],
      ["'customers.detail.clientSinceHint': 'تاريخ أول إقامة في المنشأة',"],
      ["'customers.detail.stays': 'الإقامات',"],
      ["'customers.detail.nights': 'مجموع الليالي',"],
      ["'customers.detail.spent': 'إجمالي المصروفات',"],
      ["'customers.detail.history': 'سجل الإقامات',"],
      ["'customers.detail.historyHint': 'التواريخ والأوقات ومدة كل إقامة',"],
      ["'customers.detail.nightsShort': 'ليال',"],
      ["'customers.detail.noStays': 'لا توجد إقامات مسجلة',"],
      ["'customers.detail.firstRegistration': 'التسجيل الأول',"],
    ],
    reservations: [
      ["'reservations.checkInTime': 'وقت الوصول',"],
      ["'reservations.checkOutTime': 'وقت المغادرة',"],
    ],
    rooms: [
      ["'rooms.building': 'المبنى',"],
      ["'rooms.parentRoom': 'شقة',"],
    ],
    roomTypes: [
      ["'roomTypes.kind': 'النوع',"],
      ["'roomTypes.kind.ROOM': 'غرفة',"],
      ["'roomTypes.kind.APARTMENT': 'شقة مفروشة',"],
    ],
  },
};

// Anchor key per group — the new block is inserted right after this key's line.
// Partial locales (de/it/es/sw/ar) lack some sections: fall back to a universal
// anchor present in every file (flat key order is irrelevant at runtime).
const ANCHORS = {
  customers: "'customers.idDocument':",
  reservations: "'reservations.checkOut':",
  rooms: "'rooms.floor':",
  roomTypes: "'roomTypes.maxOccupancy':",
};
const UNIVERSAL = "'reservations.checkOut':";

// customers.idDocument is itself missing from partial locales — add it.
const ID_DOC = {
  fr: null, en: null,
  de: "'customers.idDocument': 'Ausweis',",
  it: "'customers.idDocument': " + "'Documento d\u2019identità',",
  es: "'customers.idDocument': 'Documento de identidad',",
  sw: "'customers.idDocument': 'Kitambulisho',",
  ar: "'customers.idDocument': 'وثيقة الهوية',",
};

const DIR = new URL('../src/lib/i18n/locales/', import.meta.url);

for (const [loc, groups] of Object.entries(LOCALES)) {
  const file = `${DIR.pathname}${loc}.ts`;
  let src = readFileSync(file, 'utf8');
  let inserted = 0;
  if (ID_DOC[loc] && !src.includes("'customers.idDocument':")) {
    const lines = src.split('\n');
    const idx = lines.findIndex((l) => l.includes(UNIVERSAL));
    lines.splice(idx + 1, 0, `  ${ID_DOC[loc]}`);
    inserted += 1;
    src = lines.join('\n');
  }
  for (const [group, entries] of Object.entries(groups)) {
    const anchor = src.includes(ANCHORS[group]) ? ANCHORS[group] : UNIVERSAL;
    const lines = src.split('\n');
    const idx = lines.findIndex((l) => l.includes(anchor));
    if (idx === -1) {
      console.error(`${loc}: anchor not found: ${anchor}`);
      process.exit(1);
    }
    const fresh = entries.map((e) => `  ${e[0]}`).filter((l) => !src.includes(l.trim().split(':')[0] + ':'));
    if (fresh.length) {
      lines.splice(idx + 1, 0, ...fresh);
      inserted += fresh.length;
    }
    src = lines.join('\n');
  }
  writeFileSync(file, src);
  console.log(`${loc}: +${inserted} keys`);
}
