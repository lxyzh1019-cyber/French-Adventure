// Escaping values that are spliced into generated HTML.
//
// This lived in app.js, where nothing could import it. Its only coverage was a
// browser test that re-implemented the escaper inside the page and checked its
// own copy — so a regression in the real function would not have failed it.

/**
 * Escape a value for use inside an HTML attribute or as element text.
 *
 * The apostrophe matters here in a way it would not in most codebases: this is
 * a French app, and `aujourd'hui`, `l'école` and `j'ai` are ordinary content.
 * Attributes written by this app are double-quoted, so a bare `'` does not
 * break them today — but that is a property of every call site, not of the
 * function, and a single-quoted attribute anywhere would turn a vocabulary
 * word into an attribute injection. Escaping it costs nothing.
 *
 * `&` must be replaced first, or it would double-escape the entities the
 * later replacements introduce.
 */
export function escapeAttr(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
