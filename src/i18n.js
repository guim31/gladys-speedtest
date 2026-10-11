// -----------------------------------------------------------------------------
// Languages of the texts sent to Gladys.
//
// Gladys shows the user's language when a text carries it, English otherwise
// (getLocalizedText in the core front). Its interface exists in the four
// languages below: every `{ en, fr, de, es }` object of the integration
// carries exactly these (test/i18n.test.js keeps it so).
// -----------------------------------------------------------------------------

/** The languages every text exists in. `en` is the fallback. */
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

/**
 * A language of LANGUAGES: the given one when known, English otherwise.
 * @param {string} [language] the user's language
 * @returns {'en'|'fr'|'de'|'es'}
 */
export function pickLanguage(language) {
  return LANGUAGES.includes(language) ? language : 'en';
}

/**
 * A language object whose `{name}` placeholders are filled in.
 * @param {Record<string, string>} texts a `{ en, fr, de, es }` object
 * @param {Record<string, string|number>} [vars] the placeholder values
 * @returns {Record<string, string>}
 */
export function format(texts, vars = {}) {
  return Object.fromEntries(
    LANGUAGES.map((lang) => [
      lang,
      texts[lang].replace(/\{(\w+)\}/g, (match, name) =>
        name in vars ? String(vars[name]) : match,
      ),
    ]),
  );
}

/** The connection status when the post-connection setup fails. */
export const INIT_FAILED_STATUS = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, prüfe die Logs der Integration.',
  es: 'La inicialización falló, consulte los registros de la integración.',
};
