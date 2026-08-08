export type Course = {
  code?: string;
  name?: string;
  credits?: number | null;
  description?: string;
  learningOutcomes?: string;
  level?: number | null;
  grade?: string;
  points?: number | null;
  status?: string;
};

type AnalysisBody = Record<string, unknown>;

export const clean = (value: unknown, max = 180) =>
  String(value ?? "").normalize("NFKC").trim().slice(0, max);

export const finite = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function normalizedWords(value: unknown) {
  const stopWords = new Set([
    "and", "the", "for", "with", "from", "into", "course", "introduction", "fundamentals",
    "و", "في", "من", "إلى", "على", "عن", "مقرر", "مقدمة", "أساسيات",
  ]);
  return new Set(
    clean(value, 2_000)
      .toLocaleLowerCase("en")
      .replace(/[^a-z0-9\u00c0-\u024f\u0600-\u06ff]+/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word)),
  );
}

function setSimilarity(left: unknown, right: unknown) {
  const a = normalizedWords(left);
  const b = normalizedWords(right);
  const intersection = [...a].filter((word) => b.has(word)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function courseLevel(course: Course) {
  const explicit = finite(course.level, -1);
  if (explicit >= 0) return explicit;
  const match = clean(course.code).match(/\d{3,4}/);
  return match ? Math.floor(Number(match[0]) / (match[0].length === 4 ? 1_000 : 100)) : -1;
}

function similarity(left: Course, right: Course) {
  const leftCode = clean(left.code).toLocaleLowerCase("en").replace(/[^a-z0-9]/g, "");
  const rightCode = clean(right.code).toLocaleLowerCase("en").replace(/[^a-z0-9]/g, "");
  const leftNumber = leftCode.match(/\d+/)?.[0] || "";
  const rightNumber = rightCode.match(/\d+/)?.[0] || "";
  const codeScore = leftCode && rightCode
    ? leftCode === rightCode ? 1 : leftNumber && leftNumber === rightNumber ? 0.58 : 0
    : 0;
  const titleScore = setSimilarity(left.name, right.name);
  const outcomeScore = setSimilarity(
    `${clean(left.description, 2_000)} ${clean(left.learningOutcomes, 2_000)}`,
    `${clean(right.description, 2_000)} ${clean(right.learningOutcomes, 2_000)}`,
  );
  const hasCredits = Number.isFinite(Number(left.credits)) && Number.isFinite(Number(right.credits));
  const creditDifference = hasCredits ? Math.abs(finite(left.credits) - finite(right.credits)) : Infinity;
  const creditScore = !hasCredits ? 0 : creditDifference === 0 ? 1 : creditDifference <= 1 ? 0.65 : 0;
  const leftLevel = courseLevel(left);
  const rightLevel = courseLevel(right);
  const levelScore = leftLevel < 0 || rightLevel < 0 ? 0 : leftLevel === rightLevel ? 1 : Math.abs(leftLevel - rightLevel) === 1 ? 0.5 : 0;
  let score = codeScore * 0.25 + titleScore * 0.3 + outcomeScore * 0.25 + creditScore * 0.15 + levelScore * 0.05;
  if (codeScore === 1 && titleScore >= 0.35 && creditScore >= 0.65) score = Math.max(score, 0.88);
  const supportingSignals = [codeScore >= 0.58, titleScore >= 0.42, outcomeScore >= 0.35, creditScore >= 0.65, levelScore >= 0.5]
    .filter(Boolean).length;
  return {
    score: Math.min(0.98, score),
    supportingSignals,
    evidence: {
      code: Math.round(codeScore * 100),
      title: Math.round(titleScore * 100),
      learning: Math.round(outcomeScore * 100),
      credits: Math.round(creditScore * 100),
      level: Math.round(levelScore * 100),
    },
  };
}

export function transferAnalysis(body: AnalysisBody) {
  const source = Array.isArray(body.sourceCourses) ? body.sourceCourses.slice(0, 300) as Course[] : [];
  const target = Array.isArray(body.targetCourses) ? body.targetCourses.slice(0, 300) as Course[] : [];
  return {
    matches: source.map((course) => {
      const ranked = target
        .map((candidate) => ({ candidate, ...similarity(course, candidate) }))
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      const score = best?.score || 0;
      const likely = score >= 0.78 && (best?.supportingSignals || 0) >= 2;
      const review = score >= 0.45 && (best?.supportingSignals || 0) >= 1;
      return {
        source: course,
        target: score >= 0.35 ? best.candidate : null,
        confidence: Math.round(score * 100),
        evidence: best?.evidence || { code: 0, title: 0, learning: 0, credits: 0, level: 0 },
        decision: likely ? "likely_match" : review ? "review" : "unmatched",
        reason: likely
          ? "At least two independent signals align across code, title, learning evidence, credits, or level."
          : review
            ? "Some evidence aligns, but the description or learning outcomes need official comparison."
            : "No sufficiently similar target course was found.",
      };
    }),
    disclaimer: "This is a planning estimate. Only the receiving institution can award transfer credit.",
  };
}

export function academicTwin(body: AnalysisBody) {
  const currentGpa = Math.max(0, finite(body.currentGpa));
  const completedCredits = Math.max(0, finite(body.completedCredits));
  const remainingCredits = Math.max(1, finite(body.remainingCredits, 1));
  const targetGpa = Math.max(0, finite(body.targetGpa));
  const maxGpa = Math.max(1, finite(body.maxGpa, 4));
  const costPerCredit = Math.max(0, finite(body.costPerCredit));
  const termsRemaining = Math.max(1, Math.round(finite(body.termsRemaining, 4)));
  const requiredPoints =
    targetGpa * (completedCredits + remainingCredits) -
    currentGpa * completedCredits;
  const requiredAverage = requiredPoints / remainingCredits;
  const baselineCreditsPerTerm = remainingCredits / termsRemaining;
  const scenarios = [
    { id: "fastest", label: "Fastest", terms: Math.max(1, termsRemaining - 1), load: 1.2, risk: "High" },
    { id: "balanced", label: "Balanced", terms: termsRemaining, load: 1, risk: "Medium" },
    { id: "safest", label: "Safest", terms: termsRemaining + 1, load: 0.82, risk: "Low" },
  ].map((scenario) => {
    const creditsPerTerm = Math.ceil(remainingCredits / scenario.terms);
    const achievable = requiredAverage <= maxGpa;
    const pacePenalty = Math.max(0, creditsPerTerm - Math.ceil(baselineCreditsPerTerm));
    return {
      ...scenario,
      creditsPerTerm,
      requiredAverage: Math.max(0, requiredAverage),
      achievable,
      expectedRange: achievable
        ? [
            Math.max(0, targetGpa - 0.05 - pacePenalty * 0.005),
            Math.min(maxGpa, targetGpa + 0.04),
          ]
        : [null, null],
      estimatedTuition: remainingCredits * costPerCredit,
      weeklyStudyHours: Math.round(creditsPerTerm * 2.5 * scenario.load),
      assumptions: [
        "All remaining credits count toward cumulative GPA.",
        "No repeated-course replacement has been applied unless already reflected in the current GPA.",
        "Tuition excludes fixed fees, scholarships, inflation, and living costs.",
      ],
    };
  });
  return {
    requiredAverage,
    achievable: requiredAverage <= maxGpa,
    scenarios,
    confidence: completedCredits > 0 && remainingCredits > 0 ? "medium" : "low",
  };
}

export function parseSyllabus(body: AnalysisBody) {
  const text = clean(body.text, 120_000);
  const sourceEvidence = body.sourceEvidence && typeof body.sourceEvidence === "object"
    ? body.sourceEvidence as Record<string, unknown> : {};
  const extractionConfidence = Math.max(0, Math.min(1, finite(sourceEvidence.confidence, 0)));
  if (text.length < 30) {
    return { assessments: [], chunks: [], warnings: ["Not enough readable syllabus text was supplied."] };
  }
  let sourcePage = 1;
  const lines = text.split(/\r?\n/).flatMap((rawLine) => {
    const line = rawLine.trim();
    const marker = line.match(/^\[\[PAGE\s+(\d+)\]\]$/i);
    if (marker) { sourcePage = Math.max(1, Number(marker[1]) || 1); return []; }
    return line ? [{ text: line, page: sourcePage }] : [];
  }).slice(0, 2_000);
  const datePattern = /\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]20\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*20\d{2})?)\b/i;
  const weightPattern = /(\d{1,3}(?:\.\d+)?)\s*%/;
  const normalizedDate = (value: string) => {
    const yearFirst = value.match(/^(20\d{2})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (yearFirst) return `${yearFirst[1]}-${yearFirst[2].padStart(2, "0")}-${yearFirst[3].padStart(2, "0")}`;
    const dayFirst = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](20\d{2})$/);
    if (dayFirst) return `${dayFirst[3]}-${dayFirst[2].padStart(2, "0")}-${dayFirst[1].padStart(2, "0")}`;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().slice(0, 10);
  };
  const assessments = lines.flatMap((sourceLine, index) => {
    const line = sourceLine.text;
    const weight = line.match(weightPattern);
    const date = line.match(datePattern);
    if (!weight && !date) return [];
    const label = line
      .replace(weightPattern, "")
      .replace(datePattern, "")
      .replace(/[:|–—-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100) || `Assessment ${index + 1}`;
    return [{
      id: crypto.randomUUID(),
      label,
      weight: weight ? Math.min(100, finite(weight[1])) : null,
      dueDate: date ? normalizedDate(date[1]) : null,
      score: null,
      sourceLine: index + 1,
      sourcePage: sourceLine.page,
      sourceExcerpt: line.slice(0, 320),
      confidence: Math.round(Math.min(0.99, 0.45 + (weight ? 0.18 : 0) + (date ? 0.18 : 0) + extractionConfidence * 0.18) * 100),
      confidenceBasis: {
        extractionMethod: clean(sourceEvidence.method, 40) || "unknown",
        extractionConfidence: Math.round(extractionConfidence * 100),
        detectedWeight: Boolean(weight),
        detectedDate: Boolean(date),
      },
    }];
  }).slice(0, 100);
  const chunks = lines.slice(0, 500).map((line, index) => ({
    lineStart: index + 1,
    lineEnd: index + 1,
    page: line.page,
    text: line.text.slice(0, 500),
  }));
  const totalWeight = assessments.reduce((sum, item) => sum + (item.weight || 0), 0);
  return {
    assessments,
    chunks,
    sourceEvidence: {
      method: clean(sourceEvidence.method, 40) || "unknown",
      confidence: Math.round(extractionConfidence * 100),
      pageCount: Math.max(1, finite(sourceEvidence.pageCount, 1)),
    },
    totalWeight,
    warnings: [
      ...(assessments.length ? [] : ["No assessment weights or dates were detected automatically."]),
      ...(totalWeight > 0 && Math.abs(totalWeight - 100) > 0.5
        ? [`Detected weights total ${totalWeight.toFixed(1)}%, not 100%. Review the syllabus rows.`]
        : []),
    ],
  };
}

function assessmentAnswer(question: string, syllabus: AnalysisBody) {
  const assessments = Array.isArray(syllabus.assessments)
    ? syllabus.assessments as Array<Record<string, unknown>>
    : [];
  const lowered = question.toLocaleLowerCase("en");
  if (!assessments.length) return null;
  if (/(next|nearest|soon|due|موعد|قادم|prochain|próxim)/u.test(lowered)) {
    const dated = assessments
      .map<Record<string, unknown> & { date: Date }>((item) => ({
        ...item,
        date: new Date(clean(item.dueDate, 80)),
      }))
      .filter((item) => !Number.isNaN(item.date.getTime()) && item.date.getTime() >= Date.now())
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const next = dated[0];
    if (next) {
      return {
        answer: `The next dated assessment is ${clean(next.label)} on ${clean(next.dueDate)} and it carries ${finite(next.weight)}% of the course grade.`,
        sourceLine: finite(next.sourceLine),
        excerpt: clean(next.sourceExcerpt || next.label, 320),
      };
    }
  }
  if (/(largest|highest|weight|important|أكبر|وزن|plus important|mayor peso)/u.test(lowered)) {
    const largest = [...assessments].sort((a, b) => finite(b.weight) - finite(a.weight))[0];
    if (largest) {
      return {
        answer: `${clean(largest.label)} has the largest detected weight at ${finite(largest.weight)}%.`,
        sourceLine: finite(largest.sourceLine),
        excerpt: clean(largest.sourceExcerpt || largest.label, 320),
      };
    }
  }
  return null;
}

export function syllabusChat(body: AnalysisBody) {
  const question = clean(body.question, 500);
  const syllabus = body.syllabus && typeof body.syllabus === "object"
    ? body.syllabus as AnalysisBody
    : {};
  if (question.length < 3) throw new Error("INVALID_SYLLABUS_QUESTION");
  const direct = assessmentAnswer(question, syllabus);
  const chunks = Array.isArray(syllabus.chunks)
    ? syllabus.chunks.slice(0, 500) as Array<Record<string, unknown>>
    : [];
  const queryWords = normalizedWords(question);
  const ranked = chunks
    .map((chunk) => {
      const words = normalizedWords(chunk.text);
      const overlap = [...queryWords].filter((word) => words.has(word)).length;
      return { chunk, score: overlap / Math.max(1, queryWords.size) };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const citations = [
    ...(direct ? [{
      lineStart: direct.sourceLine,
      lineEnd: direct.sourceLine,
      excerpt: direct.excerpt,
    }] : []),
    ...ranked.map(({ chunk }) => ({
      lineStart: finite(chunk.lineStart),
      lineEnd: finite(chunk.lineEnd, finite(chunk.lineStart)),
      excerpt: clean(chunk.text, 320),
    })),
  ].filter((citation, index, all) =>
    citation.lineStart > 0 &&
    all.findIndex((item) => item.lineStart === citation.lineStart) === index,
  ).slice(0, 3);
  const answer = direct?.answer || (citations.length
    ? `The closest syllabus evidence is: ${citations.map((item) => item.excerpt).join(" ")}`
    : "I could not find a supported answer in the saved syllabus text. Try asking about a named assessment, percentage, date, attendance rule, or policy phrase.");
  return {
    answer,
    citations,
    confidence: direct ? "high" : citations.length >= 2 ? "medium" : citations.length ? "low" : "insufficient",
    limitation: "Answers are restricted to saved syllabus evidence and do not replace the instructor or official course system.",
  };
}

const CREDIT_SOURCES = {
  ects: {
    label: "European Commission — ECTS",
    url: "https://education.ec.europa.eu/education-levels/higher-education/inclusive-and-connected-higher-education/european-credit-transfer-and-accumulation-system",
  },
  cats: {
    label: "QAA — Higher Education Credit Framework for England",
    url: "https://www.qaa.ac.uk/docs/qaa/quality-code/higher-education-credit-framework-for-england.pdf",
  },
};

export function creditConversion(body: AnalysisBody) {
  const amount = Math.max(0, finite(body.credits));
  const source = clean(body.sourceSystem, 30).toUpperCase();
  const target = clean(body.targetSystem, 30).toUpperCase();
  if (!["ECTS", "UK_CATS", "US_SEMESTER"].includes(source) ||
      !["ECTS", "UK_CATS", "US_SEMESTER"].includes(target) ||
      source === target) {
    throw new Error("INVALID_CREDIT_SYSTEM");
  }
  let range: [number, number];
  let basis: string;
  if (source === "ECTS" && target === "UK_CATS") {
    range = [amount * 2, amount * 2];
    basis = "QAA states that everyday practice uses two UK credits for one ECTS credit.";
  } else if (source === "UK_CATS" && target === "ECTS") {
    range = [amount / 2, amount / 2];
    basis = "QAA states that everyday practice uses two UK credits for one ECTS credit.";
  } else {
    const ectsRange: [number, number] = source === "US_SEMESTER"
      ? [amount * 1.5, amount * 2]
      : source === "UK_CATS"
        ? [amount / 2, amount / 2]
        : [amount, amount];
    if (target === "US_SEMESTER") range = [ectsRange[0] / 2, ectsRange[1] / 1.5];
    else if (target === "UK_CATS") range = [ectsRange[0] * 2, ectsRange[1] * 2];
    else range = ectsRange;
    basis = "US semester-credit comparisons are workload heuristics, not an official universal equivalency; a range is shown instead of a false exact value.";
  }
  return {
    sourceSystem: source,
    targetSystem: target,
    inputCredits: amount,
    range: range.map((value) => Math.round(value * 100) / 100),
    exact: Math.abs(range[0] - range[1]) < 0.001,
    basis,
    sources: [CREDIT_SOURCES.ects, CREDIT_SOURCES.cats],
    disclaimer: "Credit conversion does not award transfer credit or prove learning-outcome equivalence. The receiving institution decides.",
  };
}

const ACADEMIC_GLOSSARY: Record<string, Record<string, string>> = {
  ar: {
    syllabus: "الخطة الدراسية للمقرر",
    assessment: "تقييم",
    assignment: "واجب",
    quiz: "اختبار قصير",
    midterm: "اختبار منتصف الفصل",
    final: "الاختبار النهائي",
    "credit hours": "الساعات المعتمدة",
    prerequisite: "متطلب سابق",
    withdrawal: "انسحاب",
    "grade point average": "المعدل التراكمي",
    attendance: "الحضور",
    deadline: "الموعد النهائي",
  },
  en: {
    "الخطة الدراسية للمقرر": "syllabus",
    "تقييم": "assessment",
    "واجب": "assignment",
    "اختبار قصير": "quiz",
    "اختبار منتصف الفصل": "midterm",
    "الاختبار النهائي": "final examination",
    "الساعات المعتمدة": "credit hours",
    "متطلب سابق": "prerequisite",
    "انسحاب": "withdrawal",
    "المعدل التراكمي": "grade point average",
    "الحضور": "attendance",
    "الموعد النهائي": "deadline",
  },
};

export function academicTranslation(body: AnalysisBody) {
  const text = clean(body.text, 60_000);
  const targetLanguage = clean(body.targetLanguage, 10).toLocaleLowerCase("en");
  const glossary = ACADEMIC_GLOSSARY[targetLanguage];
  if (!glossary || text.length < 2) throw new Error("INVALID_TRANSLATION_REQUEST");
  let translatedText = text;
  let matches = 0;
  Object.entries(glossary)
    .sort((a, b) => b[0].length - a[0].length)
    .forEach(([source, translated]) => {
      const pattern = new RegExp(`\\b${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
      translatedText = translatedText.replace(pattern, () => {
        matches += 1;
        return translated;
      });
    });
  return {
    originalText: text,
    translatedText,
    targetLanguage,
    matchedAcademicTerms: matches,
    glossary: Object.entries(glossary).map(([source, translated]) => ({ source, translated })),
    statement: "This is a source-preserving academic terminology aid, not a certified full-document translation. Unchanged prose must be reviewed by a fluent speaker.",
  };
}

function seededRandom(seedText: string) {
  let seed = 2166136261;
  for (const character of seedText) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed += 0x6D2B79F5;
    let value = seed;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function percentile(values: number[], point: number) {
  if (!values.length) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.floor(point * values.length)));
  return values[index];
}

export function academicUndo(body: AnalysisBody) {
  const currentGpa = Math.max(0, finite(body.currentGpa));
  const completedCredits = Math.max(0, finite(body.completedCredits));
  const remainingCredits = Math.max(1, finite(body.remainingCredits, 60));
  const maxGpa = Math.max(1, finite(body.maxGpa, 4));
  const targetGpa = Math.min(maxGpa, Math.max(0, finite(body.targetGpa, 3.5)));
  const scholarshipGpa = Math.min(maxGpa, Math.max(0, finite(body.scholarshipGpa, targetGpa)));
  const expectedAverage = Math.min(maxGpa, Math.max(0, finite(body.expectedAverage, currentGpa)));
  const afterExpectedAverage = Math.min(maxGpa, Math.max(0, finite(body.afterExpectedAverage, expectedAverage)));
  const uncertainty = Math.min(maxGpa, Math.max(0.01, finite(body.uncertainty, 0.35)));
  const afterUncertainty = Math.min(maxGpa, Math.max(0.01, finite(body.afterUncertainty, uncertainty)));
  const additionalCredits = Math.max(0, finite(body.additionalCredits));
  const delayTerms = Math.max(0, Math.round(finite(body.delayTerms)));
  const extraCost = finite(body.extraCost);
  const decision = clean(body.decision, 60) || "Academic decision";
  const deadline = clean(body.deadline, 80);
  const affectedPrerequisites = Array.isArray(body.affectedPrerequisites)
    ? body.affectedPrerequisites.map((item) => clean(item, 100)).filter(Boolean).slice(0, 50)
    : clean(body.affectedPrerequisites, 1_000).split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean).slice(0, 50);
  const policySource = clean(body.policySource, 500);
  const policyName = clean(body.policyName, 180);
  const policyEffectiveDate = clean(body.policyEffectiveDate, 80);
  const simulations = 5_000;
  const random = seededRandom(JSON.stringify({
    currentGpa, completedCredits, remainingCredits, targetGpa, expectedAverage,
    afterExpectedAverage, uncertainty, afterUncertainty, additionalCredits, decision,
  }));
  const before: number[] = [];
  const after: number[] = [];
  for (let index = 0; index < simulations; index += 1) {
    const u1 = Math.max(Number.EPSILON, random());
    const u2 = Math.max(Number.EPSILON, random());
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const futureAverage = Math.min(maxGpa, Math.max(0, expectedAverage + z * uncertainty));
    const afterAverage = Math.min(maxGpa, Math.max(0, afterExpectedAverage + z * afterUncertainty));
    before.push(
      (currentGpa * completedCredits + futureAverage * remainingCredits) /
      Math.max(1, completedCredits + remainingCredits),
    );
    after.push(
      (currentGpa * completedCredits + afterAverage * (remainingCredits + additionalCredits)) /
      Math.max(1, completedCredits + remainingCredits + additionalCredits),
    );
  }
  before.sort((a, b) => a - b);
  after.sort((a, b) => a - b);
  const chance = (values: number[], threshold: number) =>
    Math.round(values.filter((value) => value >= threshold).length * 10_000 / values.length) / 100;
  const result = {
    decision,
    simulations,
    before: {
      targetProbability: chance(before, targetGpa),
      scholarshipProbability: chance(before, scholarshipGpa),
      gpaRange95: [percentile(before, 0.025), percentile(before, 0.975)],
      medianGpa: percentile(before, 0.5),
    },
    after: {
      targetProbability: chance(after, targetGpa),
      scholarshipProbability: chance(after, scholarshipGpa),
      gpaRange95: [percentile(after, 0.025), percentile(after, 0.975)],
      medianGpa: percentile(after, 0.5),
    },
    impact: {
      probabilityChange: chance(after, targetGpa) - chance(before, targetGpa),
      delayTerms,
      extraCost,
      additionalCredits,
      affectedPrerequisites,
      deadline: deadline || null,
      scholarshipStatus: chance(after, scholarshipGpa) >= 80
        ? "likely_safe"
        : chance(after, scholarshipGpa) >= 50
          ? "uncertain"
          : "at_risk",
    },
    evidence: {
      policyName: policyName || "No policy selected",
      policySource: policySource || null,
      effectiveDate: policyEffectiveDate || null,
    },
    assumptions: [
      "The simulation uses the averages and uncertainty entered by the student; it does not predict individual grades.",
      "Costs exclude financing, inflation, refunds, fixed fees, and living expenses unless included in the entered extra cost.",
      "University, scholarship, visa, and financial-aid decisions remain authoritative.",
    ],
  };
  return result;
}

export function integrityReview(body: AnalysisBody) {
  const courses = Array.isArray(body.courses) ? body.courses.slice(0, 500) as Course[] : [];
  const file = (body.file && typeof body.file === "object" ? body.file : {}) as AnalysisBody;
  const issues: Array<{ level: string; label: string; detail: string }> = [];
  if (!clean(file.sha256, 128)) {
    issues.push({ level: "medium", label: "No document fingerprint", detail: "A SHA-256 fingerprint was not supplied." });
  }
  if (!courses.length) {
    issues.push({ level: "high", label: "No structured courses", detail: "The file did not produce reviewable course rows." });
  }
  const duplicateKeys = new Map<string, number>();
  courses.forEach((course) => {
    const key = `${clean(course.code).toLocaleLowerCase("en")}|${clean(course.name).toLocaleLowerCase("en")}`;
    duplicateKeys.set(key, (duplicateKeys.get(key) || 0) + 1);
    if (finite(course.credits, -1) < 0 || finite(course.credits) > 30) {
      issues.push({ level: "medium", label: "Unusual credit value", detail: `${clean(course.code || course.name)} has an unusual credit value.` });
    }
  });
  const duplicates = [...duplicateKeys.entries()].filter(([key, count]) => key !== "|" && count > 1);
  if (duplicates.length) {
    issues.push({ level: "low", label: "Repeated course identities", detail: `${duplicates.length} repeated course code/title combinations require retake-policy review.` });
  }
  const high = issues.filter((issue) => issue.level === "high").length;
  const medium = issues.filter((issue) => issue.level === "medium").length;
  const score = Math.max(0, 100 - high * 30 - medium * 12 - Math.max(0, issues.length - high - medium) * 4);
  return {
    score,
    tier: high ? "needs_review" : medium ? "review" : "no_material_signal",
    issues,
    statement: "This score checks consistency and review readiness only. It does not prove authenticity or fraud.",
  };
}

export function nextTermPlan(body: AnalysisBody) {
  const courses = Array.isArray(body.courses) ? body.courses.slice(0, 1_000) as Course[] : [];
  const facts = Array.isArray(body.catalogFacts) ? body.catalogFacts.slice(0, 10_000) as Array<Record<string, unknown>> : [];
  const offered = new Set((Array.isArray(body.offeredCourseCodes) ? body.offeredCourseCodes : [])
    .map((code) => clean(code, 30).replace(/[^a-z0-9]/gi, "").toUpperCase()).filter(Boolean));
  const maxCredits = Math.max(1, Math.min(30, finite(body.maxCredits, 18)));
  const completed = new Set(courses.filter((course) => {
    const status = clean(course.status, 40).toLocaleLowerCase("en");
    const grade = clean(course.grade, 20).toLocaleUpperCase("en");
    return ["completed", "passed", "graded"].includes(status) && !["F", "U", "W", "I"].includes(grade);
  }).map((course) => clean(course.code, 30).replace(/[^a-z0-9]/gi, "").toUpperCase()).filter(Boolean));
  if (!offered.size) {
    return { verified: false, certainty: "uncertain", selected: [], blocked: [], message: "Uncertain: no official next-term offering list was provided, so no course recommendation was invented." };
  }
  type Candidate = Record<string, unknown> & {
    code: string; title: string; normalizedCode: string; prerequisites: string[]; corequisites: string[];
    credits?: number; groupName?: string; citation?: unknown;
  };
  const candidates: Candidate[] = facts.filter((fact) => fact.kind === "course" && fact.code).map((fact) => ({
    ...fact,
    code: clean(fact.code, 30), title: clean(fact.title, 180),
    normalizedCode: clean(fact.code, 30).replace(/[^a-z0-9]/gi, "").toUpperCase(),
    prerequisites: Array.isArray(fact.prerequisiteCodes) ? fact.prerequisiteCodes.map((code: unknown) => clean(code, 30).replace(/[^a-z0-9]/gi, "").toUpperCase()) : [],
    corequisites: Array.isArray(fact.corequisiteCodes) ? fact.corequisiteCodes.map((code: unknown) => clean(code, 30).replace(/[^a-z0-9]/gi, "").toUpperCase()) : [],
  })).filter((fact) => offered.has(fact.normalizedCode) && !completed.has(fact.normalizedCode));
  const eligible = candidates.filter((course) => course.prerequisites.every((code: string) => completed.has(code))
    && course.corequisites.every((code: string) => completed.has(code) || offered.has(code)));
  const blocked = candidates.filter((course) => course.prerequisites.some((code: string) => !completed.has(code))
    || course.corequisites.some((code: string) => !completed.has(code) && !offered.has(code))).map((course) => ({
    code: course.code, title: course.title,
    missingPrerequisites: course.prerequisites.filter((code: string) => !completed.has(code)),
    missingCorequisites: course.corequisites.filter((code: string) => !completed.has(code) && !offered.has(code)),
    citation: course.citation,
  }));
  const selected: Array<Record<string, unknown>> = [];
  let credits = 0;
  for (const course of eligible.sort((left, right) => left.prerequisites.length - right.prerequisites.length || finite(right.credits) - finite(left.credits))) {
    const courseCredits = Math.max(0, finite(course.credits));
    if (courseCredits <= 0 || credits + courseCredits > maxCredits) continue;
    selected.push({
      code: course.code, title: course.title, credits: courseCredits, groupName: course.groupName,
      requiredCorequisites: course.corequisites.filter((code: string) => !completed.has(code)), citation: course.citation,
    });
    credits += courseCredits;
  }
  return {
    verified: true, certainty: "source_grounded", selected, blocked, totalCredits: credits,
    message: selected.length ? "Plan uses only approved catalog courses, satisfied prerequisites, and the supplied official offering list." : "No offered course is currently eligible under the approved prerequisites.",
    limitation: "Confirm seat availability, timetable conflicts, adviser approval, and co-requisites in the live university registration system.",
  };
}

export function runProAnalysis(action: string, body: AnalysisBody) {
  if (action === "academic_twin") return academicTwin(body);
  if (action === "transfer") return transferAnalysis(body);
  if (action === "syllabus") return parseSyllabus(body);
  if (action === "syllabus_chat") return syllabusChat(body);
  if (action === "credit_conversion") return creditConversion(body);
  if (action === "translate_document") return academicTranslation(body);
  if (action === "academic_undo") return academicUndo(body);
  if (action === "integrity") return integrityReview(body);
  if (action === "next_term_plan") return nextTermPlan(body);
  throw new Error("UNKNOWN_PRO_ACTION");
}
