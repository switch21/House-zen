import fr from './fr';
import en from './en';
import es from './es';
import de from './de';
import ar from './ar';
import it from './it';
import sw from './sw';
import { registerLocale } from '../core';

registerLocale('fr', fr);
registerLocale('en', en);
registerLocale('es', es);
registerLocale('de', de);
registerLocale('ar', ar);
registerLocale('it', it);
registerLocale('sw', sw);

export const allTranslations = { fr, en, es, de, ar, it, sw };
