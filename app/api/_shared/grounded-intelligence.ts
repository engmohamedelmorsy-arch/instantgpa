import { env } from "cloudflare:workers";
import { transferAnalysis, type Course } from "./pro-analysis";

type AiBinding = { run(model: string, input: Record<string, unknown>): Promise<unknown> };
type Body = Record<string, unknown>;
type CatalogFact = Record<string, unknown> & { sourceId?: string; sourcePage?: number };
type CatalogSource = Record<string, unknown> & { id?: string; sourceTitle?: string; sourceUrl?: string };

const aiBinding = () => (env as unknown as { AI?: AiBinding }).AI;
const clean = (value: unknown, max = 2_000) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
const courseText = (course: Course) => clean([course.code, course.name, course.description, course.learningOutcomes].filter(Boolean).join(" · "), 3_000);

function cosine(left: number[], right: number[]) {
  let dot = 0; let leftNorm = 0; let rightNorm = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index]; leftNorm += left[index] ** 2; rightNorm += right[index] ** 2;
  }
  return leftNorm && rightNorm ? dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)) : 0;
}

async function embeddings(texts: string[]) {
  const ai = aiBinding();
  if (!ai || !texts.length) return null;
  const response = await ai.run("@cf/baai/bge-m3", { text: texts }) as { data?: unknown; embeddings?: unknown };
  const vectors = Array.isArray(response?.data) ? response.data : Array.isArray(response?.embeddings) ? response.embeddings : null;
  return vectors?.length === texts.length ? vectors as number[][] : null;
}

export async function semanticTransferAnalysis(body: Body) {
  const source = Array.isArray(body.sourceCourses) ? body.sourceCourses.slice(0, 100) as Course[] : [];
  const target = Array.isArray(body.targetCourses) ? body.targetCourses.slice(0, 200) as Course[] : [];
  const fallback = transferAnalysis({ ...body, sourceCourses: source, targetCourses: target });
  const hasDeepEvidence = [...source, ...target].some((course) => clean(course.description).length > 30 || clean(course.learningOutcomes).length > 30);
  if (!aiBinding() || !hasDeepEvidence || !source.length || !target.length) {
    return { ...fallback, engine: "lexical_evidence", semanticAvailable: false, certainty: "unverified", limitation: "Embeddings require course descriptions or learning outcomes. The current estimate uses only code, title, credits, and level." };
  }
  try {
    const vectors = await embeddings([...source.map(courseText), ...target.map(courseText)]);
    if (!vectors) throw new Error("EMBEDDINGS_UNAVAILABLE");
    const sourceVectors = vectors.slice(0, source.length);
    const targetVectors = vectors.slice(source.length);
    const matches = source.map((course, sourceIndex) => {
      const ranked = target.map((candidate, targetIndex) => ({ candidate, semantic: Math.max(0, cosine(sourceVectors[sourceIndex], targetVectors[targetIndex])) }))
        .sort((a, b) => b.semantic - a.semantic);
      const best = ranked[0];
      const lexicalPair = transferAnalysis({ sourceCourses: [course], targetCourses: best ? [best.candidate] : [] }).matches[0];
      const lexical = Number(lexicalPair?.confidence || 0) / 100;
      const score = best ? best.semantic * 0.6 + lexical * 0.4 : 0;
      const deepEvidence = clean(course.description).length > 30 || clean(course.learningOutcomes).length > 30;
      const decision = score >= 0.79 && deepEvidence ? "likely_match" : score >= 0.48 ? "review" : "unmatched";
      return {
        source: course, target: score >= 0.35 ? best?.candidate || null : null,
        confidence: Math.round(Math.min(0.97, score) * 100),
        evidence: { ...(lexicalPair?.evidence || {}), semantic: Math.round((best?.semantic || 0) * 100) },
        decision,
        reason: decision === "likely_match"
          ? "Multilingual semantic similarity and structured course signals align. Official faculty approval is still required."
          : decision === "review"
            ? "Some semantic or structured evidence aligns, but the official syllabus outcomes need human review."
            : "No target course has enough semantic and structured evidence.",
      };
    });
    return { matches, engine: "cloudflare_bge_m3", semanticAvailable: true, certainty: "planning_estimate", disclaimer: fallback.disclaimer };
  } catch {
    return { ...fallback, engine: "lexical_evidence", semanticAvailable: false, certainty: "unverified", limitation: "Semantic matching was temporarily unavailable; this result must be treated as unverified." };
  }
}

function lexicalScore(question: string, fact: CatalogFact) {
  const words = new Set(clean(question).toLocaleLowerCase("en").split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2));
  const text = clean([fact.title, fact.summary, fact.code, fact.ruleType, fact.groupName].join(" "), 4_000).toLocaleLowerCase("en");
  return [...words].filter((word) => text.includes(word)).length / Math.max(1, words.size);
}

export async function answerOfficialPolicyQuestion(body: Body) {
  const question = clean(body.question, 500);
  const facts = Array.isArray(body.facts) ? body.facts.slice(0, 500) as CatalogFact[] : [];
  const sources = Array.isArray(body.sources) ? body.sources.slice(0, 30) as CatalogSource[] : [];
  if (question.length < 3 || !facts.length || !sources.length) {
    return { answer: "Uncertain: no approved official source supports an answer.", confidence: "insufficient", citations: [], verified: false };
  }
  let ranked = facts.map((fact) => ({ fact, score: lexicalScore(question, fact) }));
  try {
    const vectors = await embeddings([question, ...facts.map((fact) => clean([fact.title, fact.summary, fact.code, fact.ruleType].join(" · "), 2_000))]);
    if (vectors) ranked = facts.map((fact, index) => ({ fact, score: cosine(vectors[0], vectors[index + 1]) }));
  } catch { /* lexical retrieval remains source-grounded */ }
  const top = ranked.filter((row) => row.score >= 0.18).sort((a, b) => b.score - a.score).slice(0, 3);
  if (!top.length) return { answer: "Uncertain: the approved catalog does not contain a relevant rule.", confidence: "insufficient", citations: [], verified: false };
  const sourceMap = new Map(sources.map((source) => [String(source.id || ""), source]));
  const citations = top.map(({ fact, score }) => {
    const source = sourceMap.get(String(fact.sourceId || "")) || {};
    return { summary: clean(fact.summary, 500), page: Number(fact.sourcePage) || 1, sourceTitle: clean(source.sourceTitle, 180), sourceUrl: clean(source.sourceUrl, 500), score: Math.round(score * 100) };
  });
  return {
    answer: citations.map((citation) => citation.summary).join(" "),
    confidence: citations[0].score >= 70 ? "high" : citations[0].score >= 40 ? "medium" : "low",
    citations, verified: true,
    limitation: "This answer is assembled only from Owner-approved official excerpts. Confirm the cited page for the final institutional decision.",
  };
}
