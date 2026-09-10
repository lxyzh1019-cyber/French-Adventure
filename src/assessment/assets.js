// Child-facing artwork for the speaking prompts that need a picture.
//
// Four items in Release A carry an asset *brief* rather than an asset. A brief
// describes what the picture must contain; it is authoring instruction, and it
// must never be shown — printing SA-D02's required_labels would read
// "school, park, library, bank", which is the vocabulary the prompt is asking
// the child to produce.
//
// Until these existed, speaking could not reach its minimum of four valid items
// on either form (five prompts, two unrenderable), so the domain reported
// insufficient_evidence no matter how well a learner did.
//
// Drawn rather than photographed, and deliberately plain:
//
//   • Illustrations carry NO text of any kind. Both briefs list
//     prohibited_text: French labels, English object labels — a label would
//     hand over the noun the child is meant to retrieve.
//   • Maps carry French place labels and no route arrows, which is what their
//     learner_view asks for: the place names are the reference points for
//     giving directions, and an arrow would give the directions away.
//   • Colours are stated in the brief where they matter (SA-F02 asks for a
//     colour), so red, blue and green are unmistakable and not near-neighbours.
//   • Explicit fills throughout, and a painted background: these render inside
//     a card that follows the viewer's theme, and an unpainted illustration
//     would invert with it.
//
// Every asset is checked against its brief's required_elements by a test, so a
// picture cannot quietly lose the object the prompt depends on.

const PAPER = '#fdfdfb';
const INK = '#2b2b2b';
const ROAD = '#d8d8d2';
const ROAD_EDGE = '#b9b9b2';
const GREEN = '#1e9e57';
const BLUE = '#2563eb';
const RED = '#dc2626';
const WOOD = '#a9713f';
const WOOD_DARK = '#8a5a31';

/** A labelled building on a map. The label is French; that is the point. */
const place = (x, y, w, h, fill, label) => `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${fill}" stroke="${INK}" stroke-width="2"/>
    <text x="${x + w / 2}" y="${y + h + 18}" text-anchor="middle"
          font-family="'Nunito',sans-serif" font-size="15" font-weight="800" fill="${INK}">${label}</text>`;

/**
 * SA-F02 — "name two things you can see, and give one colour".
 * Brief: red pencil, blue book, green bag, chair, table. Illustration only.
 */
const SA_F02 = `
<svg viewBox="0 0 400 300" role="img" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="300" fill="${PAPER}"/>
  <rect x="34" y="150" width="230" height="14" rx="4" fill="${WOOD}" stroke="${INK}" stroke-width="2"/>
  <rect x="50" y="164" width="14" height="98" fill="${WOOD_DARK}" stroke="${INK}" stroke-width="2"/>
  <rect x="234" y="164" width="14" height="98" fill="${WOOD_DARK}" stroke="${INK}" stroke-width="2"/>
  <rect x="56" y="126" width="86" height="24" rx="3" fill="${BLUE}" stroke="${INK}" stroke-width="2"/>
  <line x1="56" y1="144" x2="142" y2="144" stroke="#ffffff" stroke-width="3"/>
  <rect x="164" y="134" width="72" height="12" rx="2" fill="${RED}" stroke="${INK}" stroke-width="2"/>
  <polygon points="236,134 256,140 236,146" fill="#f2d3a7" stroke="${INK}" stroke-width="2"/>
  <rect x="157" y="134" width="8" height="12" rx="2" fill="#f4c1c1" stroke="${INK}" stroke-width="2"/>
  <rect x="286" y="196" width="92" height="13" rx="3" fill="${WOOD}" stroke="${INK}" stroke-width="2"/>
  <rect x="366" y="112" width="13" height="84" rx="3" fill="${WOOD}" stroke="${INK}" stroke-width="2"/>
  <rect x="291" y="209" width="11" height="53" fill="${WOOD_DARK}" stroke="${INK}" stroke-width="2"/>
  <rect x="366" y="209" width="11" height="53" fill="${WOOD_DARK}" stroke="${INK}" stroke-width="2"/>
  <rect x="92" y="200" width="76" height="62" rx="9" fill="${GREEN}" stroke="${INK}" stroke-width="2"/>
  <path d="M112 200 v-16 a18 18 0 0 1 36 0 v16" fill="none" stroke="${INK}" stroke-width="3"/>
  <line x1="20" y1="262" x2="384" y2="262" stroke="${INK}" stroke-width="2"/>
</svg>`;

/**
 * SB-F02 — "name two things you can see, and give one location".
 * Brief: bed, lamp on a table, book under a chair, window. Illustration only.
 *
 * The prompt asks for a location, so the spatial relations have to read at a
 * glance: the lamp sits ON the table, the book sits UNDER the chair. Four
 * objects, four separated zones, nothing overlapping anything else.
 */
const SB_F02 = `
<svg viewBox="0 0 400 300" role="img" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="300" fill="${PAPER}"/>
  <rect x="30" y="28" width="100" height="80" rx="4" fill="#cfe6f7" stroke="${INK}" stroke-width="3"/>
  <line x1="80" y1="28" x2="80" y2="108" stroke="${INK}" stroke-width="3"/>
  <line x1="30" y1="68" x2="130" y2="68" stroke="${INK}" stroke-width="3"/>
  <rect x="24" y="180" width="164" height="46" rx="6" fill="#e8eef5" stroke="${INK}" stroke-width="2"/>
  <rect x="24" y="152" width="28" height="74" rx="6" fill="${WOOD}" stroke="${INK}" stroke-width="2"/>
  <rect x="60" y="166" width="50" height="22" rx="6" fill="#ffffff" stroke="${INK}" stroke-width="2"/>
  <rect x="24" y="226" width="164" height="10" fill="${WOOD_DARK}" stroke="${INK}" stroke-width="2"/>
  <rect x="230" y="120" width="112" height="13" rx="3" fill="${WOOD}" stroke="${INK}" stroke-width="2"/>
  <rect x="240" y="133" width="11" height="39" fill="${WOOD_DARK}" stroke="${INK}" stroke-width="2"/>
  <rect x="321" y="133" width="11" height="39" fill="${WOOD_DARK}" stroke="${INK}" stroke-width="2"/>
  <polygon points="264,74 308,74 320,120 252,120" fill="#f6c445" stroke="${INK}" stroke-width="2"/>
  <rect x="280" y="52" width="12" height="22" fill="${INK}"/>
  <rect x="236" y="240" width="94" height="13" rx="3" fill="${WOOD}" stroke="${INK}" stroke-width="2"/>
  <rect x="318" y="182" width="12" height="58" rx="3" fill="${WOOD}" stroke="${INK}" stroke-width="2"/>
  <rect x="241" y="253" width="11" height="31" fill="${WOOD_DARK}" stroke="${INK}" stroke-width="2"/>
  <rect x="318" y="253" width="11" height="31" fill="${WOOD_DARK}" stroke="${INK}" stroke-width="2"/>
  <rect x="258" y="264" width="52" height="14" rx="2" fill="${BLUE}" stroke="${INK}" stroke-width="2"/>
  <line x1="258" y1="274" x2="310" y2="274" stroke="#ffffff" stroke-width="2"/>
  <line x1="16" y1="284" x2="384" y2="284" stroke="${INK}" stroke-width="2"/>
</svg>`;

/**
 * SA-D02 — "how to go from the school to the library".
 * Brief route: start at school, go straight to park, turn left, library beside
 * bank. So the school sits at the foot of a straight road up to the park, and
 * the turning is genuinely to the left as the child faces up the page.
 * No arrows: the roads say where you may go, not which way to walk.
 */
const SA_D02 = `
<svg viewBox="0 0 400 300" role="img" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="300" fill="${PAPER}"/>
  <rect x="176" y="60" width="48" height="220" fill="${ROAD}" stroke="${ROAD_EDGE}" stroke-width="2"/>
  <rect x="40" y="60" width="184" height="48" fill="${ROAD}" stroke="${ROAD_EDGE}" stroke-width="2"/>
  <line x1="200" y1="130" x2="200" y2="270" stroke="#ffffff" stroke-width="3" stroke-dasharray="12 10"/>
  <line x1="52" y1="84" x2="170" y2="84" stroke="#ffffff" stroke-width="3" stroke-dasharray="12 10"/>
  ${place(238, 210, 96, 52, '#f2c9c9', 'école')}
  ${place(238, 96, 96, 52, '#c9e6cf', 'parc')}
  ${place(44, 128, 82, 48, '#cfd9f5', 'bibliothèque')}
  ${place(140, 128, 60, 48, '#f5e3bd', 'banque')}
</svg>`;

/**
 * SB-D02 — "how to go from the park to the bakery".
 * Brief route: start at park, pass school, turn right at library, bakery across
 * from pool. Reading left to right, the park is west, the school is passed on
 * the way, the library is at the corner, and turning right there heads south to
 * the bakery — with the pool directly opposite it across the road.
 */
const SB_D02 = `
<svg viewBox="0 0 400 300" role="img" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="300" fill="${PAPER}"/>
  <rect x="20" y="72" width="304" height="46" fill="${ROAD}" stroke="${ROAD_EDGE}" stroke-width="2"/>
  <rect x="278" y="72" width="46" height="208" fill="${ROAD}" stroke="${ROAD_EDGE}" stroke-width="2"/>
  <line x1="30" y1="95" x2="270" y2="95" stroke="#ffffff" stroke-width="3" stroke-dasharray="12 10"/>
  <line x1="301" y1="126" x2="301" y2="270" stroke="#ffffff" stroke-width="3" stroke-dasharray="12 10"/>
  ${place(24, 128, 72, 46, '#c9e6cf', 'parc')}
  ${place(120, 128, 76, 46, '#f2c9c9', 'école')}
  ${place(214, 128, 56, 46, '#cfd9f5', 'bibliothèque')}
  ${place(186, 214, 78, 46, '#f5d6a8', 'boulangerie')}
  ${place(330, 214, 56, 46, '#bfe3ef', 'piscine')}
</svg>`;

/** Every built asset, by the item it belongs to. */
export const ITEM_ASSETS = {
  'SA-F02': { kind: 'illustration', svg: SA_F02 },
  'SB-F02': { kind: 'illustration', svg: SB_F02 },
  'SA-D02': { kind: 'map', svg: SA_D02 },
  'SB-D02': { kind: 'map', svg: SB_D02 },
};

export function assetFor(itemId) {
  return ITEM_ASSETS[itemId] ?? null;
}

export function hasAssetFor(itemId) {
  return itemId in ITEM_ASSETS;
}
