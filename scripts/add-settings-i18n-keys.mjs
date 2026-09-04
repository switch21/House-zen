/**
 * HOUSE-ZEN — injects the settings-branding / taxes / policies / team /
 * payments / invoice-print i18n keys into every locale file
 * (fr, en, de, it, es, sw, ar), anchored before the closing brace.
 * Idempotent: skips keys already present.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = '/home/z/my-project/house-zen/src/lib/i18n/locales';

/** [key, fr, en, de, it, es, sw, ar] */
const KEYS = [
  // ---- Settings → Général : établissement + logo ----
  ['settings.establishment', 'Établissement', 'Establishment', 'Betrieb', 'Struttura', 'Establecimiento', 'Taasisi', 'المنشأة'],
  ['settings.phone', 'Téléphone', 'Phone', 'Telefon', 'Telefono', 'Teléfono', 'Simu', 'الهاتف'],
  ['settings.address', 'Adresse', 'Address', 'Adresse', 'Indirizzo', 'Dirección', 'Anwani', 'العنوان'],
  ['settings.city', 'Ville', 'City', 'Stadt', 'Città', 'Ciudad', 'Mji', 'المدينة'],
  ['settings.country', 'Pays', 'Country', 'Land', 'Paese', 'País', 'Nchi', 'البلد'],
  ['settings.contactEmail', 'E-mail de contact', 'Contact e-mail', 'Kontakt-E-Mail', 'E-mail di contatto', 'E-mail de contacto', 'Barua pepe ya mawasiliano', 'البريد الإلكتروني للتواصل'],
  ['settings.website', 'Site web', 'Website', 'Webseite', 'Sito web', 'Sitio web', 'Tovuti', 'الموقع الإلكتروني'],
  ['settings.taxId', 'Identifiant fiscal', 'Tax ID', 'Steuernummer', 'Codice fiscale', 'Identificación fiscal', 'Kitambulisho cha kodi', 'المعرّف الضريبي'],
  ['settings.registrationNo', 'Registre de commerce', 'Trade register', 'Handelsregister', 'Registro commerciale', 'Registro mercantil', 'Rejista ya biashara', 'السجل التجاري'],
  ['settings.defaultCheckin', 'Heure d’arrivée par défaut', 'Default check-in time', 'Standard-Check-in-Zeit', 'Orario di check-in predefinito', 'Hora de llegada por defecto', 'Muda wa kawaida wa kuingia', 'وقت الوصول الافتراضي'],
  ['settings.defaultCheckout', 'Heure de départ par défaut', 'Default check-out time', 'Standard-Check-out-Zeit', 'Orario di check-out predefinito', 'Hora de salida por defecto', 'Muda wa kawaida wa kutoka', 'وقت المغادرة الافتراضي'],
  ['settings.readOnlyRole', 'Votre rôle ne permet pas de modifier ces paramètres.', 'Your role cannot modify these settings.', 'Ihre Rolle darf diese Einstellungen nicht ändern.', 'Il tuo ruolo non può modificare queste impostazioni.', 'Tu rol no permite modificar estos ajustes.', 'Wako hauwezi kubadilisha mipangilio hii.', 'دورك لا يسمح بتعديل هذه الإعدادات.'],
  ['settings.logo', 'Logo de l’établissement', 'Establishment logo', 'Betriebslogo', 'Logo della struttura', 'Logotipo del establecimiento', 'Nembo ya taasisi', 'شعار المنشأة'],
  ['settings.logoHint', 'Ce logo apparaît en en-tête des documents imprimés (factures…).', 'This logo appears in the header of printed documents (invoices…).', 'Dieses Logo erscheint im Kopfbereich gedruckter Dokumente.', 'Questo logo appare nell’intestazione dei documenti stampati.', 'Este logotipo aparece en el encabezado de los documentos impresos.', 'Nembo hii huonekana kichwa cha nyaraka zilizochapishwa.', 'يظهر هذا الشعار في ترويسة المستندات المطبوعة.'],
  ['settings.logoEmpty', 'Aucun logo défini', 'No logo yet', 'Noch kein Logo', 'Nessun logo', 'Sin logotipo', 'Hakuna nembo', 'لا يوجد شعار'],
  ['settings.logoUpload', 'Importer un logo', 'Upload a logo', 'Logo hochladen', 'Carica un logo', 'Subir un logotipo', 'Pakia nembo', 'تحميل شعار'],
  ['settings.logoReplace', 'Remplacer', 'Replace', 'Ersetzen', 'Sostituisci', 'Reemplazar', 'Badilisha', 'استبدال'],
  ['settings.logoDemoHint', 'Mode démo : le logo est conservé localement dans la session.', 'Demo mode: the logo is kept locally in the session.', 'Demomodus: Das Logo wird lokal in der Sitzung gespeichert.', 'Modalità demo: il logo è conservato localmente.', 'Modo demo: el logotipo se guarda localmente.', 'Hali ya demo: nembo huhifadhiwa kwenye kipindi.', 'وضع العرض: يُحفظ الشعار محلياً.'],
  // ---- Settings → Taxes ----
  ['settings.taxesHint', 'Taxes appliquées aux séjours et services facturables.', 'Taxes applied to stays and billable services.', 'Steuern auf Aufenthalte und abrechenbare Leistungen.', 'Tasse applicate ai soggiorni e ai servizi fatturabili.', 'Impuestos aplicados a estancias y servicios facturables.', 'Kodi zinazotumika kwa malazi na huduma.', 'الضرائب المطبقة على الإقامات والخدمات.'],
  ['settings.taxAdd', 'Ajouter une taxe', 'Add a tax', 'Steuer hinzufügen', 'Aggiungi tassa', 'Añadir impuesto', 'Ongeza kodi', 'إضافة ضريبة'],
  ['settings.taxEdit', 'Modifier la taxe', 'Edit tax', 'Steuer bearbeiten', 'Modifica tassa', 'Editar impuesto', 'Hariri kodi', 'تعديل الضريبة'],
  ['settings.taxRate', 'Taux (%)', 'Rate (%)', 'Satz (%)', 'Aliquota (%)', 'Tarifa (%)', 'Kiwango (%)', 'النسبة (%)'],
  ['settings.taxDefault', 'Par défaut', 'Default', 'Standard', 'Predefinita', 'Por defecto', 'Chaguo-msingi', 'افتراضي'],
  ['settings.taxInvalid', 'Nom requis et taux entre 0 et 100.', 'Name required, rate between 0 and 100.', 'Name erforderlich, Satz zwischen 0 und 100.', 'Nome richiesto, aliquota tra 0 e 100.', 'Nombre requerido, tarifa entre 0 y 100.', 'Jina linahitajika, kiwango kati ya 0 na 100.', 'الاسم مطلوب والنسبة بين 0 و 100.'],
  ['settings.taxDeleteConfirm', 'Supprimer cette taxe ?', 'Delete this tax?', 'Diese Steuer löschen?', 'Eliminare questa tassa?', '¿Eliminar este impuesto?', 'Ufute kodi hii?', 'حذف هذه الضريبة؟'],
  // ---- Settings → Politiques d'annulation ----
  ['settings.policiesHint', 'Règles d’annulation proposées aux clients lors de la réservation.', 'Cancellation rules offered to guests at booking time.', 'Stornoregeln, die Gästen bei der Buchung angeboten werden.', 'Regole di cancellazione proposte agli ospiti in prenotazione.', 'Reglas de cancelación ofrecidas a los huéspedes al reservar.', 'Sheria za kufuta zinazotolewa kwa wageni wakati wa kuweka nafasi.', 'قواعد الإلغاء المقدمة للضيوف عند الحجز.'],
  ['settings.policyAdd', 'Ajouter une politique', 'Add a policy', 'Richtlinie hinzufügen', 'Aggiungi politica', 'Añadir política', 'Ongeza sera', 'إضافة سياسة'],
  ['settings.policyEdit', 'Modifier la politique', 'Edit policy', 'Richtlinie bearbeiten', 'Modifica politica', 'Editar política', 'Hariri sera', 'تعديل السياسة'],
  ['settings.policyInvalid', 'Nom requis, heures entre 0 et 720 et pénalité entre 0 et 100.', 'Name required, hours 0–720 and penalty 0–100.', 'Name erforderlich, Stunden 0–720, Strafe 0–100.', 'Nome richiesto, ore 0–720, penale 0–100.', 'Nombre requerido, horas 0–720 y penalización 0–100.', 'Jina linahitajika, saa 0–720 na adhabu 0–100.', 'الاسم مطلوب، الساعات 0–720 والغرامة 0–100.'],
  ['settings.policyDeleteConfirm', 'Supprimer cette politique ?', 'Delete this policy?', 'Diese Richtlinie löschen?', 'Eliminare questa politica?', '¿Eliminar esta política?', 'Ufute sera hii?', 'حذف هذه السياسة؟'],
  ['settings.policyNamePlaceholder', 'ex. Annulation flexible', 'e.g. Flexible cancellation', 'z. B. Flexible Stornierung', 'es. Cancellazione flessibile', 'ej. Cancelación flexible', 'mf. Kufuta kwa kubadilika', 'مثال: إلغاء مرن'],
  // ---- Communs ----
  ['common.saved', 'Enregistré', 'Saved', 'Gespeichert', 'Salvato', 'Guardado', 'Imehifadhiwa', 'تم الحفظ'],
  ['team.you', 'Vous', 'You', 'Sie', 'Tu', 'Tú', 'Wewe', 'أنت'],
  // ---- Paiements ----
  ['payments.allocate', 'Affecter à la facture (optionnel)', 'Allocate to invoice (optional)', 'Rechnung zuordnen (optional)', 'Alloca alla fattura (opzionale)', 'Asignar a la factura (opcional)', 'Gawa kwa ankara (hiari)', 'تخصيص للفاتورة (اختياري)'],
  // ---- Impression facture ----
  ['invoices.print', 'Imprimer', 'Print', 'Drucken', 'Stampa', 'Imprimir', 'Chapisha', 'طباعة'],
  ['invoices.printError', 'Impossible d’ouvrir la fenêtre d’impression (autorisez les popups).', 'Cannot open the print window (allow popups).', 'Druckfenster konnte nicht geöffnet werden (Popups erlauben).', 'Impossibile aprire la finestra di stampa (consentire i popup).', 'No se pudo abrir la ventana de impresión (permita las ventanas emergentes).', 'Haiwezi kufungua dirisha la kuchapisha (ruhusa midhibiti).', 'لا يمكن فتح نافذة الطباعة (اسمح بالنوافذ المنبثقة).'],
  ['invoices.issuedAt', 'Date d’émission', 'Issue date', 'Ausstellungsdatum', 'Data di emissione', 'Fecha de emisión', 'Tarehe ya kutoa', 'تاريخ الإصدار'],
  ['invoices.printTaxId', 'NIU / TVA', 'VAT / Tax ID', 'USt-IdNr.', 'P.IVA', 'NIF / IVA', 'Namba ya kodi', 'الرقم الضريبي'],
  ['invoices.printRegNo', 'RCCM', 'Trade register', 'Handelsregister', 'Registro imprese', 'Registro mercantil', 'Rejista ya biashara', 'السجل التجاري'],
  ['invoices.itemDesc', 'Description', 'Description', 'Beschreibung', 'Descrizione', 'Descripción', 'Maelezo', 'الوصف'],
  ['invoices.itemQty', 'Qté', 'Qty', 'Menge', 'Qtà', 'Cant.', 'Idadi', 'الكمية'],
  ['invoices.itemUnit', 'Prix unitaire', 'Unit price', 'Einzelpreis', 'Prezzo unitario', 'Precio unitario', 'Bei ya kipimo', 'سعر الوحدة'],
  ['invoices.itemTotal', 'Total', 'Total', 'Gesamt', 'Totale', 'Total', 'Jumla', 'الإجمالي'],
  ['invoices.printFooter', 'Merci de votre fidélité', 'Thank you for your loyalty', 'Vielen Dank für Ihre Treue', 'Grazie per la fiducia', 'Gracias por su fidelidad', 'Asante kwa uaminifu wako', 'شكراً لوفائكم'],
];

const LANG_INDEX = { fr: 1, en: 2, de: 3, it: 4, es: 5, sw: 6, ar: 7 };

for (const [lang, idx] of Object.entries(LANG_INDEX)) {
  const file = `${BASE}/${lang}.ts`;
  let src = readFileSync(file, 'utf8');
  let added = 0;
  for (const row of KEYS) {
    const key = row[0];
    if (src.includes(`'${key}':`)) continue; // idempotent
    const value = row[idx];
    if (!value) throw new Error(`missing ${lang} translation for ${key}`);
    const line = `  '${key}': ${JSON.stringify(value)},`;
    // Insert before the closing brace of the locale object.
    const anchor = src.lastIndexOf('};');
    if (anchor === -1) throw new Error(`no closing brace in ${file}`);
    src = src.slice(0, anchor) + line + '\n' + src.slice(anchor);
    added += 1;
  }
  writeFileSync(file, src);
  console.log(`${lang}: +${added} keys`);
}
