/**
 * HOUSE-ZEN — injecte les clés i18n "vitrine publique + médias" dans chaque
 * locale (fr, en, de, it, es, sw, ar), ancrées après des clés existantes.
 * Idempotent : saute les clés déjà présentes.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const LOCALES = {
  fr: {
    media: [
      ["'media.upload': 'Téléverser des photos',"],
      ["'media.addUrl': 'Ajouter par URL',"],
      ["'media.urlPlaceholder': 'https://…',"],
      ["'media.hint': 'Téléversez des fichiers ou collez des URL — la première photo sert de couverture.',"],
      ["'media.empty': 'Aucune photo pour le moment.',"],
      ["'media.remove': 'Retirer',"],
      ["'media.tooLarge': 'Image trop volumineuse (500 Ko maximum).',"],
      ["'media.uploadFailed': 'Échec du téléversement.',"],
      ["'media.processing': 'Traitement…',"],
    ],
    properties: [
      ["'properties.description': 'Description (page publique)',"],
      ["'properties.photos': 'Photos de l’établissement',"],
      ["'properties.viewPublic': 'Voir la page publique',"],
    ],
    roomTypes: [
      ["'roomTypes.photos': 'Photos',"],
    ],
    booking: [
      ["'booking.about': 'À propos de l’établissement',"],
      ["'booking.ourRooms': 'Nos chambres & appartements',"],
      ["'booking.capacity': 'Capacité',"],
      ["'booking.fromPrice': 'à partir de',"],
      ["'booking.perNight': '/ nuit',"],
      ["'booking.persons': 'personnes',"],
    ],
  },
  en: {
    media: [
      ["'media.upload': 'Upload photos',"],
      ["'media.addUrl': 'Add by URL',"],
      ["'media.urlPlaceholder': 'https://…',"],
      ["'media.hint': 'Upload files or paste URLs — the first photo is used as the cover.',"],
      ["'media.empty': 'No photo yet.',"],
      ["'media.remove': 'Remove',"],
      ["'media.tooLarge': 'Image too large (500 KB maximum).',"],
      ["'media.uploadFailed': 'Upload failed.',"],
      ["'media.processing': 'Processing…',"],
    ],
    properties: [
      ["'properties.description': 'Description (public page)',"],
      ["'properties.photos': 'Property photos',"],
      ["'properties.viewPublic': 'View public page',"],
    ],
    roomTypes: [
      ["'roomTypes.photos': 'Photos',"],
    ],
    booking: [
      ["'booking.about': 'About this property',"],
      ["'booking.ourRooms': 'Our rooms & apartments',"],
      ["'booking.capacity': 'Capacity',"],
      ["'booking.fromPrice': 'from',"],
      ["'booking.perNight': '/ night',"],
      ["'booking.persons': 'guests',"],
    ],
  },
  de: {
    media: [
      ["'media.upload': 'Fotos hochladen',"],
      ["'media.addUrl': 'Per URL hinzufügen',"],
      ["'media.urlPlaceholder': 'https://…',"],
      ["'media.hint': 'Dateien hochladen oder URLs einfügen — das erste Foto dient als Titelbild.',"],
      ["'media.empty': 'Noch kein Foto.',"],
      ["'media.remove': 'Entfernen',"],
      ["'media.tooLarge': 'Bild zu groß (maximal 500 KB).',"],
      ["'media.uploadFailed': 'Upload fehlgeschlagen.',"],
      ["'media.processing': 'Verarbeitung…',"],
    ],
    properties: [
      ["'properties.description': 'Beschreibung (öffentliche Seite)',"],
      ["'properties.photos': 'Fotos der Unterkunft',"],
      ["'properties.viewPublic': 'Öffentliche Seite ansehen',"],
    ],
    roomTypes: [
      ["'roomTypes.photos': 'Fotos',"],
    ],
    booking: [
      ["'booking.about': 'Über die Unterkunft',"],
      ["'booking.ourRooms': 'Unsere Zimmer & Apartments',"],
      ["'booking.capacity': 'Kapazität',"],
      ["'booking.fromPrice': 'ab',"],
      ["'booking.perNight': '/ Nacht',"],
      ["'booking.persons': 'Gäste',"],
    ],
  },
  it: {
    media: [
      ["'media.upload': 'Carica foto',"],
      ["'media.addUrl': 'Aggiungi per URL',"],
      ["'media.urlPlaceholder': 'https://…',"],
      ["'media.hint': 'Carica file o incolla URL — la prima foto è la copertina.',"],
      ["'media.empty': 'Nessuna foto per ora.',"],
      ["'media.remove': 'Rimuovi',"],
      ["'media.tooLarge': 'Immagine troppo grande (max 500 KB).',"],
      ["'media.uploadFailed': 'Caricamento non riuscito.',"],
      ["'media.processing': 'Elaborazione…',"],
    ],
    properties: [
      ["'properties.description': 'Descrizione (pagina pubblica)',"],
      ["'properties.photos': 'Foto della struttura',"],
      ["'properties.viewPublic': 'Vedi pagina pubblica',"],
    ],
    roomTypes: [
      ["'roomTypes.photos': 'Foto',"],
    ],
    booking: [
      ["'booking.about': 'Sulla struttura',"],
      ["'booking.ourRooms': 'Camere & appartamenti',"],
      ["'booking.capacity': 'Capacità',"],
      ["'booking.fromPrice': 'da',"],
      ["'booking.perNight': '/ notte',"],
      ["'booking.persons': 'ospiti',"],
    ],
  },
  es: {
    media: [
      ["'media.upload': 'Subir fotos',"],
      ["'media.addUrl': 'Añadir por URL',"],
      ["'media.urlPlaceholder': 'https://…',"],
      ["'media.hint': 'Sube archivos o pega URL — la primera foto es la portada.',"],
      ["'media.empty': 'Aún no hay fotos.',"],
      ["'media.remove': 'Quitar',"],
      ["'media.tooLarge': 'Imagen demasiado grande (máx. 500 KB).',"],
      ["'media.uploadFailed': 'Error al subir.',"],
      ["'media.processing': 'Procesando…',"],
    ],
    properties: [
      ["'properties.description': 'Descripción (página pública)',"],
      ["'properties.photos': 'Fotos del establecimiento',"],
      ["'properties.viewPublic': 'Ver página pública',"],
    ],
    roomTypes: [
      ["'roomTypes.photos': 'Fotos',"],
    ],
    booking: [
      ["'booking.about': 'Sobre el establecimiento',"],
      ["'booking.ourRooms': 'Nuestras habitaciones y apartamentos',"],
      ["'booking.capacity': 'Capacidad',"],
      ["'booking.fromPrice': 'desde',"],
      ["'booking.perNight': '/ noche',"],
      ["'booking.persons': 'personas',"],
    ],
  },
  sw: {
    media: [
      ["'media.upload': 'Pakia picha',"],
      ["'media.addUrl': 'Ongeza kwa URL',"],
      ["'media.urlPlaceholder': 'https://…',"],
      ["'media.hint': 'Pakia faili au weka URL — picha ya kwanza ni jalada.',"],
      ["'media.empty': 'Hakuna picha bado.',"],
      ["'media.remove': 'Ondoa',"],
      ["'media.tooLarge': 'Picha ni kubwa mno (hadhi 500 KB).',"],
      ["'media.uploadFailed': 'Upakiajaji umeshindikana.',"],
      ["'media.processing': 'Inashughulikia…',"],
    ],
    properties: [
      ["'properties.description': 'Maelezo (ukurasa wa umma)',"],
      ["'properties.photos': 'Picha taasisi',"],
      ["'properties.viewPublic': 'Ona ukurasa wa umma',"],
    ],
    roomTypes: [
      ["'roomTypes.photos': 'Picha',"],
    ],
    booking: [
      ["'booking.about': 'Kuhusu taasisi',"],
      ["'booking.ourRooms': 'Vyumba na apamenti yetu',"],
      ["'booking.capacity': 'Uwezo',"],
      ["'booking.fromPrice': 'kutoka',"],
      ["'booking.perNight': '/ usiku',"],
      ["'booking.persons': 'wageni',"],
    ],
  },
  ar: {
    media: [
      ["'media.upload': 'تحميل الصور',"],
      ["'media.addUrl': 'إضافة عبر رابط',"],
      ["'media.urlPlaceholder': 'https://…',"],
      ["'media.hint': 'قم بتحميل ملفات أو ألصق روابط — الصورة الأولى هي الغلاف.',"],
      ["'media.empty': 'لا توجد صور بعد.',"],
      ["'media.remove': 'إزالة',"],
      ["'media.tooLarge': 'الصورة كبيرة جداً (500 كيلوبايت كحد أقصى).',"],
      ["'media.uploadFailed': 'فشل التحميل.',"],
      ["'media.processing': 'جارٍ المعالجة…',"],
    ],
    properties: [
      ["'properties.description': 'الوصف (الصفحة العامة)',"],
      ["'properties.photos': 'صور المنشأة',"],
      ["'properties.viewPublic': 'عرض الصفحة العامة',"],
    ],
    roomTypes: [
      ["'roomTypes.photos': 'الصور',"],
    ],
    booking: [
      ["'booking.about': 'عن المنشأة',"],
      ["'booking.ourRooms': 'غرفنا وشققنا',"],
      ["'booking.capacity': 'السعة',"],
      ["'booking.fromPrice': 'ابتداءً من',"],
      ["'booking.perNight': '/ ليلة',"],
      ["'booking.persons': 'أشخاص',"],
    ],
  },
};

const ANCHORS = {
  media: "'reservations.checkOut':",
  properties: "'properties.name':",
  roomTypes: "'roomTypes.maxOccupancy':",
  booking: "'booking.title':",
};
const UNIVERSAL = "'reservations.checkOut':";

const DIR = new URL('../src/lib/i18n/locales/', import.meta.url);

for (const [loc, groups] of Object.entries(LOCALES)) {
  const file = `${DIR.pathname}${loc}.ts`;
  let src = readFileSync(file, 'utf8');
  let inserted = 0;
  for (const [group, entries] of Object.entries(groups)) {
    const anchor = src.includes(ANCHORS[group]) ? ANCHORS[group] : UNIVERSAL;
    const lines = src.split('\n');
    const idx = lines.findIndex((l) => l.includes(anchor));
    if (idx === -1) {
      console.error(`${loc}: anchor not found: ${anchor}`);
      process.exit(1);
    }
    const fresh = entries
      .map((e) => `  ${e[0]}`)
      .filter((l) => !src.includes(l.trim().split(':')[0] + ':'));
    if (fresh.length) {
      lines.splice(idx + 1, 0, ...fresh);
      inserted += fresh.length;
    }
    src = lines.join('\n');
  }
  writeFileSync(file, src);
  console.log(`${loc}: +${inserted} keys`);
}
