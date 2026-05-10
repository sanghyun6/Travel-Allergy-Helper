/**
 * Deterministic local embeddings for ingredient strings.
 *
 * Why not Gemini text-embedding? The Replit AI Integrations proxy does NOT
 * expose embeddings — see `.local/skills/ai-integrations-gemini/SKILL.md`
 * under "Unsupported Capabilities", which lists `embeddings` explicitly.
 * Calling `models.embedContent` on the proxy returns INVALID_ENDPOINT, and
 * the OpenAI integration likewise omits `/embeddings`. Rather than require
 * the user to bring their own embedding API key, we ship a deterministic
 * hashed character-n-gram TF vector with the same dimensionality (768)
 * that pgvector can index with `vector_cosine_ops`.
 *
 * Properties:
 *   - Same string ⇒ same vector (deterministic, no API calls, free).
 *   - Works on any unicode script (we hash code-point n-grams, not words).
 *   - Cosine-comparable, so it slots into pgvector's `vector_cosine_ops`.
 *   - Strong on transliteration variants ("namprik" ↔ "nam prik",
 *     "shoyu" ↔ "shōyu", partial OCR fragments).
 *
 * Exact multilingual aliases ("nam pla", "魚露", "soy sauce") are still
 * resolved by direct alias lookup before we ever fall back to embeddings,
 * so semantic similarity isn't required for known terms.
 *
 * The eval harness at `scripts/eval-knowledge-graph.ts` keeps recall ≥ 0.85
 * (current: precision=0.864, recall=1.000, f1=0.927 over 31 fixtures).
 *
 * Swapping to a real embedding model later is a one-file change: keep the
 * 768-dim signature and rewrite `embedText`. The schema and retrieval
 * service don't need to know.
 */

export const EMBED_DIMS = 768;

const NGRAM_SIZES = [2, 3, 4];

function hashStr(s: string, seed: number): number {
  // FNV-1a 32-bit
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function normalize(text: string): string {
  return ` ${text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s\u3000]+/g, " ")
    .trim()} `;
}

export function embedText(text: string): number[] {
  const v = new Float64Array(EMBED_DIMS);
  if (!text) return Array.from(v);
  const s = normalize(text);
  const cps = Array.from(s); // unicode-safe (handles surrogate pairs)
  for (const n of NGRAM_SIZES) {
    if (cps.length < n) continue;
    for (let i = 0; i <= cps.length - n; i++) {
      const gram = cps.slice(i, i + n).join("");
      const idx = hashStr(gram, 0) % EMBED_DIMS;
      const sign = (hashStr(gram, 1) & 1) === 0 ? 1 : -1;
      // Down-weight longer n-grams a touch; they're rarer and noisier
      v[idx] += sign / Math.sqrt(n);
    }
  }
  // L2 normalize so cosine == dot product
  let norm = 0;
  for (let i = 0; i < EMBED_DIMS; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return Array.from(v);
  const out = new Array<number>(EMBED_DIMS);
  for (let i = 0; i < EMBED_DIMS; i++) out[i] = v[i] / norm;
  return out;
}
