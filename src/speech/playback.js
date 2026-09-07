// Speech playback.
//
// The product decision is Canadian French. Asking for fr-CA does not guarantee
// the device has an fr-CA voice installed, and a mismatched voice reads French
// with an English accent — worse than a France-French voice. So we look at what
// the device actually has and pick the best available French voice, preferring
// Canadian, then any other French, and record which one was chosen so
// pronunciation work later starts from real data rather than an assumption.

export const PREFERRED_LOCALE = 'fr-CA';
export const FALLBACK_LOCALE  = 'fr-FR';

/** Normalise a voice's language tag: "fr_CA", "fr-ca" -> "fr-CA". */
function langTag(voice) {
  const raw = String(voice?.lang || '').replace('_', '-');
  const [lang, region] = raw.split('-');
  return region ? `${lang.toLowerCase()}-${region.toUpperCase()}` : lang.toLowerCase();
}

/**
 * Choose the best available French voice.
 * Canadian first, then any other French, then nothing (let the platform decide).
 */
export function pickFrenchVoice(voices) {
  const french = (voices || []).filter(v => langTag(v).startsWith('fr'));
  if (!french.length) return null;
  return french.find(v => langTag(v) === PREFERRED_LOCALE)
      ?? french.find(v => langTag(v) === FALLBACK_LOCALE)
      ?? french[0];
}

/** What actually got used, for the pronunciation work in a later milestone. */
export function describeVoice(voice, requested = PREFERRED_LOCALE) {
  if (!voice) return { requested, resolved: null, name: null, isPreferred: false, isFrench: false };
  const resolved = langTag(voice);
  return {
    requested, resolved, name: voice.name || null,
    isPreferred: resolved === PREFERRED_LOCALE,
    isFrench: resolved.startsWith('fr'),
  };
}
