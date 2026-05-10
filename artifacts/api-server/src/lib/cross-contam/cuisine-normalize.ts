/**
 * Single source of truth for mapping a freeform cuisine / language string
 * (e.g. "Japanese", "ja", "ja-JP", "Italian Trattoria") to the canonical
 * cuisine bucket used by `cuisineFacts(...)`. Both /menu/analyze (SSE
 * baseline scoring) and /cross-contamination/score (review-note rescoring)
 * MUST go through this so the same menu produces the same risk verdict
 * regardless of which path emitted it.
 */
export function normalizeCuisine(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.toLowerCase().trim();
  if (!t) return null;
  if (/japan|^ja(\b|-)/.test(t)) return "japanese";
  if (/chinese|mandarin|cantonese|^zh(\b|-)/.test(t)) return "chinese";
  if (/thai|^th(\b|-)/.test(t)) return "thai";
  if (/vietnam|^vi(\b|-)/.test(t)) return "vietnamese";
  if (/korean|^ko(\b|-)/.test(t)) return "korean";
  if (/indonesi|malay|^id(\b|-)|^ms(\b|-)/.test(t)) return "indonesian";
  if (/indian|hindi|tamil|^hi(\b|-)|^ta(\b|-)/.test(t)) return "indian";
  if (/italian|italy|^it(\b|-)/.test(t)) return "italian";
  if (/french|france|^fr(\b|-)/.test(t)) return "french";
  // Spanish/Portuguese menus most often appear in mexican / latin contexts
  // in our scanner usage; bucket them with mexican defaults rather than an
  // unsupported "spanish" key so cuisine_default rules still fire.
  if (/spanish|spain|portuguese|portugal|^es(\b|-)|^pt(\b|-)/.test(t)) return "mexican";
  if (/mexican|mexico/.test(t)) return "mexican";
  if (/american|^en(\b|-)/.test(t)) return "american";
  if (/bakery|patisserie|boulanger/.test(t)) return "bakery";
  return t;
}
