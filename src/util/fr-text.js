// Pure French text helpers. No DOM, no app state — safe to unit test directly.

/**
 * Split a French string into meaningful tokens: words plus each trailing
 * punctuation mark as its own token. Used to build Sentence Builder tiles.
 */
export function frTokenize(s){
  const out = [];
  const str = s.replace(/\s+/g, ' ').trim();
  str.split(/\s+/).forEach(function(tok){
    let t = tok;
    const m = t.match(/^([\s\S]+?)([.!?…,;:«»—–]*)$/);
    if(!m) return;
    if(m[1]) out.push(m[1]);
    if(m[2]) for(let i = 0; i < m[2].length; i++) out.push(m[2][i]);
  });
  return out;
}
