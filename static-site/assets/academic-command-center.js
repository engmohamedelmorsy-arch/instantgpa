import { AcademicProfile } from "./academic-profile.js";
import { AcademicRecord } from "./academic-record.js";
import { AcademicState } from "./academic-state.js";
import { GradingEngine } from "./grading-engine.js";
import { getSavedAuditSummary } from "./degree-audit.js";
import { buildPlan } from "./planning.js";
import { evaluateCourse, normalizeCourseCode } from "./academic-policy.js";
import { routeHref } from "./app.js";
import { Storage } from "./storage.js";
import { currentLanguage } from "./localization.js";

const ADVISER_NOTES_KEY = "adviserNotes:v1";
const COMMAND_SETTINGS_KEY = "commandCenterSettings:v1";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const score = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : "—";
const L = (english, arabic) => currentLanguage() === "ar" ? arabic : english;

export function analyzeGoal({ currentGpa, completedCredits, remainingCredits, targetGpa, maxGpa, grades = [] }) {
  const current = finite(currentGpa);
  const completed = Math.max(0, finite(completedCredits));
  const remaining = Math.max(0, finite(remainingCredits));
  const target = finite(targetGpa);
  const maximum = Math.max(0.01, finite(maxGpa, 4));
  const total = completed + remaining;
  const maxFinal = total ? ((current * completed) + (maximum * remaining)) / total : current;
  if (!remaining) {
    return { reachable: target <= current, required: null, maxFinal, nextTermMinimum: null, mix: [] };
  }
  const required = ((target * total) - (current * completed)) / remaining;
  const reachable = required <= maximum + 1e-9;
  const nextCredits = Math.min(18, remaining);
  const futureCredits = Math.max(0, remaining - nextCredits);
  const nextTermMinimum = nextCredits
    ? ((target * total) - (current * completed) - (maximum * futureCredits)) / nextCredits
    : null;
  const unique = [...new Map(grades
    .map((grade) => ({ label: String(grade.label || ""), points: finite(grade.points, NaN) }))
    .filter((grade) => grade.label && Number.isFinite(grade.points))
    .sort((a, b) => b.points - a.points)
    .map((grade) => [grade.points, grade])).values()];
  const courseCount = Math.max(1, Math.ceil(remaining / 3));
  let mix = [];
  if (reachable && unique.length) {
    const high = unique.find((grade) => grade.points >= required) || unique[0];
    const low = [...unique].reverse().find((grade) => grade.points <= required) || unique.at(-1);
    if (high.points === low.points) {
      mix = [{ ...high, count: courseCount }];
    } else {
      const highCount = clamp(Math.ceil(((required - low.points) / (high.points - low.points)) * courseCount), 0, courseCount);
      mix = [
        { ...high, count: highCount },
        { ...low, count: courseCount - highCount },
      ].filter((grade) => grade.count > 0);
    }
  }
  return { reachable, required, maxFinal, nextTermMinimum, mix };
}

export function prerequisiteBottlenecks(courses) {
  const planned = courses.filter((course) => evaluateCourse(course, GradingEngine.getActive()).outcome === "planned");
  const byCode = new Map(planned.map((course) => [normalizeCourseCode(course.code), course]).filter(([code]) => code));
  const children = new Map();
  planned.forEach((course) => {
    const childCode = normalizeCourseCode(course.code);
    (course.prerequisites || []).forEach((prerequisite) => {
      const parent = normalizeCourseCode(prerequisite);
      if (!parent || !childCode) return;
      if (!children.has(parent)) children.set(parent, new Set());
      children.get(parent).add(childCode);
    });
  });
  const downstream = (code) => {
    const seen = new Set();
    const queue = [...(children.get(code) || [])];
    while (queue.length) {
      const current = queue.shift();
      if (seen.has(current)) continue;
      seen.add(current);
      queue.push(...(children.get(current) || []));
    }
    return seen.size;
  };
  return [...children.keys()].map((code) => ({
    code,
    course: byCode.get(code),
    unlocks: downstream(code),
    direct: children.get(code)?.size || 0,
  })).sort((a, b) => b.unlocks - a.unlocks || b.direct - a.direct);
}

export function workloadForTerm(term) {
  const courses = term?.courses || [];
  const credits = courses.reduce((sum, course) => sum + Math.max(0, finite(course.credits)), 0);
  const practical = courses.filter((course) => /lab|studio|practical|workshop|project|clinical/i.test(`${course.type} ${course.name}`)).length;
  const advanced = courses.filter((course) => /(?:^|\D)[3-9]\d{2}(?:\D|$)/.test(course.code || "")).length;
  const retakes = courses.filter((course) => course.isRetake).length;
  const prerequisites = courses.reduce((sum, course) => sum + (course.prerequisites?.length || 0), 0);
  const risk = credits + practical * 2.5 + advanced * 1.2 + retakes * 2 + prerequisites * .35;
  const level = risk >= 25 ? "High risk" : risk >= 20 ? "High" : risk >= 14 ? "Balanced" : "Light";
  return { credits, practical, advanced, retakes, prerequisites, risk, level };
}

function futureTermLabel(offset) {
  const now = new Date();
  const month = now.getMonth();
  let season = month >= 7 ? "Spring" : "Fall";
  let year = month >= 7 ? now.getFullYear() + 1 : now.getFullYear();
  for (let index = 1; index < offset; index += 1) {
    if (season === "Fall") season = "Spring";
    else { season = "Fall"; year += 1; }
  }
  return `${season} ${year}`;
}

function trajectoryData(semesterSummaries, plan, currentGpa, currentCredits, maxGpa, expectedAverage) {
  let credits = 0;
  let points = 0;
  const actual = semesterSummaries.map((semester) => {
    credits += finite(semester.credits);
    points += finite(semester.qualityPoints);
    return { label: semester.name, value: credits ? points / credits : null, kind: "actual" };
  }).filter((point) => Number.isFinite(point.value));
  let projectionCredits = currentCredits;
  let realisticPoints = currentGpa * currentCredits;
  let bestPoints = realisticPoints;
  let minimumPoints = realisticPoints;
  const projected = plan.terms.map((term, index) => {
    const termCredits = finite(term.credits);
    projectionCredits += termCredits;
    realisticPoints += termCredits * expectedAverage;
    bestPoints += termCredits * maxGpa;
    minimumPoints += termCredits * Math.max(0, expectedAverage - .7);
    return {
      label: futureTermLabel(index + 1),
      realistic: projectionCredits ? realisticPoints / projectionCredits : currentGpa,
      best: projectionCredits ? bestPoints / projectionCredits : currentGpa,
      minimum: projectionCredits ? minimumPoints / projectionCredits : currentGpa,
    };
  });
  return { actual, projected };
}

function polyline(points, key, width, height, maxGpa, offset) {
  const count = Math.max(1, points.length - 1);
  return points.map((point, index) => {
    const value = finite(point[key], 0);
    const x = offset + (index / count) * (width - offset * 2);
    const y = height - offset - (clamp(value, 0, maxGpa) / maxGpa) * (height - offset * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function trajectoryChart(data, maxGpa, target) {
  const actualPoints = data.actual.map((point) => ({ value: point.value }));
  const seed = actualPoints.at(-1)?.value ?? 0;
  const combined = [{ realistic: seed, best: seed, minimum: seed }, ...data.projected];
  const width = 720;
  const height = 260;
  const offset = 34;
  const actualLine = actualPoints.length ? polyline(actualPoints, "value", width, height, maxGpa, offset) : "";
  const targetY = height - offset - (clamp(target, 0, maxGpa) / maxGpa) * (height - offset * 2);
  return `<div class="trajectory-chart" role="img" aria-label="Actual and projected GPA trajectory">
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <line x1="${offset}" y1="${targetY}" x2="${width - offset}" y2="${targetY}" class="trajectory-target" />
      ${actualLine ? `<polyline points="${actualLine}" class="trajectory-actual" />` : ""}
      ${combined.length > 1 ? `<polyline points="${polyline(combined, "best", width, height, maxGpa, offset)}" class="trajectory-best" /><polyline points="${polyline(combined, "realistic", width, height, maxGpa, offset)}" class="trajectory-realistic" /><polyline points="${polyline(combined, "minimum", width, height, maxGpa, offset)}" class="trajectory-minimum" />` : ""}
    </svg>
    <div class="trajectory-legend"><span class="actual">Actual</span><span class="realistic">Realistic</span><span class="best">Best case</span><span class="minimum">Worst case</span><span class="target">Target ${score(target, 2)}</span></div>
  </div>`;
}

function auditRings(audit) {
  if (!audit?.groups?.length) return `<div class="command-empty"><strong>No requirement groups yet.</strong><span>Add university, college, major, elective, training, and capstone groups in Degree Audit.</span><a class="btn btn--ghost" href="${routeHref("degree-audit")}">Set up Degree Audit</a></div>`;
  return `<div class="audit-ring-grid">${audit.groups.map((group) => {
    const percent = group.creditsRequired > 0 ? clamp((group.creditsCompleted / group.creditsRequired) * 100, 0, 100) : 0;
    return `<details class="audit-ring-card"><summary><span class="audit-ring" style="--progress:${percent.toFixed(1)}"><b>${Math.round(percent)}%</b></span><span><strong>${esc(group.name)}</strong><small>${group.creditsCompleted} of ${group.creditsRequired} credits</small></span></summary><div><p><b>Completed:</b> ${group.courseCount} course(s)</p><p><b>In progress:</b> ${group.inProgressCourseCount} course(s)</p><p><b>Remaining:</b> ${group.remaining == null ? "Needs credit review" : `${group.remaining} credits`}</p><p><b>Alternatives:</b> Check the official programme handbook or adviser-approved elective list.</p></div></details>`;
  }).join("")}</div>`;
}

function nextActionFor(summary, audit, plan, bottlenecks) {
  if (!summary.totalCourses) return { title: "Import your transcript", body: "Review the source once, then reuse the approved record everywhere.", route: "transcript-import", label: "Start import" };
  if (summary.issues.length) return { title: `Review ${summary.issues.length} academic field${summary.issues.length === 1 ? "" : "s"}`, body: "Unknown grades or missing credits can affect every downstream result.", route: "transcript-import", label: "Review record" };
  if (!audit) return { title: "Build your Degree Audit", body: "Add requirement groups to calculate what remains before graduation.", route: "degree-audit", label: "Open audit" };
  if (bottlenecks[0]?.unlocks) return { title: `Prioritize ${bottlenecks[0].code}`, body: `It unlocks ${bottlenecks[0].unlocks} downstream course${bottlenecks[0].unlocks === 1 ? "" : "s"}.`, route: "planning", label: "Review roadmap" };
  if (plan.blockedCourses.length) return { title: "Resolve blocked courses", body: `${plan.blockedCourses.length} course(s) need credits or prerequisite confirmation.`, route: "planning", label: "Fix plan" };
  return { title: "Compare GPA scenarios", body: "Test a realistic, ambitious, and minimum-safe path before registration.", route: "scenario-lab", label: "Compare scenarios" };
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function calendarFile(plan) {
  const tasks = plan.terms.flatMap((term) => term.courses.map((course) => [
    "BEGIN:VTODO",
    `UID:${crypto.randomUUID()}@instantgpa.com`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`,
    `SUMMARY:${`${term.name}: ${course.code || course.name}`.replace(/[,;]/g, " ")}`,
    `DESCRIPTION:${`${course.name || course.code} · ${course.credits} credits · planning estimate`.replace(/[,;]/g, " ")}`,
    "END:VTODO",
  ].join("\r\n")));
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//InstantGPA//Command Center//EN", ...tasks, "END:VCALENDAR"].join("\r\n");
}

function transferMatch(source, targets) {
  const normalizedWords = (value) => new Set(String(value || "").normalize("NFKC").toLocaleLowerCase("en").replace(/[^a-z0-9\u00c0-\u024f\u0600-\u06ff]+/g, " ").split(/\s+/).filter((word) => word.length > 2));
  const sourceCode = normalizeCourseCode(source.code).toLocaleLowerCase("en").replace(/[^a-z0-9]/g, "");
  const sourceTokens = normalizedWords(source.name);
  let best = null;
  targets.forEach((target) => {
    const targetCode = normalizeCourseCode(target.code).toLocaleLowerCase("en").replace(/[^a-z0-9]/g, "");
    const targetTokens = normalizedWords(target.name);
    const overlap = [...sourceTokens].filter((token) => targetTokens.has(token)).length;
    const denominator = Math.max(1, new Set([...sourceTokens, ...targetTokens]).size);
    const nameScore = overlap / denominator;
    const creditDifference = Math.abs(finite(source.credits) - finite(target.credits));
    const creditScore = creditDifference === 0 ? .2 : creditDifference <= 1 ? .1 : 0;
    const confidence = sourceCode && targetCode && sourceCode === targetCode ? 100 : Math.round(Math.min(.98, nameScore * .8 + creditScore) * 100);
    if (!best || confidence > best.confidence) best = { target, confidence };
  });
  const confidence = best?.confidence || 0;
  const decision = confidence >= 82 ? "Likely match" : confidence >= 55 ? "Partial / syllabus review" : "No reliable match";
  return { source, target: best?.target || null, confidence, decision };
}

export function mount(container) {
  const profile = AcademicProfile.get();
  const system = GradingEngine.getActive();
  const courses = AcademicState.mergedCourses();
  const summary = AcademicState.cumulativeSummary(system);
  const semesters = AcademicState.semesterSummaries(system);
  const program = AcademicRecord.programRequirements();
  const audit = getSavedAuditSummary(courses);
  const settings = { target: Math.min(system?.maxGpa || 4, 3.5), expectedAverage: Math.min(system?.maxGpa || 4, Math.max(summary.gpa || 3, 3)), maxCredits: 18, summer: false, summerCredits: 9, costPerCredit: 0, ...(Storage.get(COMMAND_SETTINGS_KEY, {}) || {}) };
  const plan = buildPlan(courses, { maxCredits: settings.maxCredits, summer: settings.summer, summerCredits: settings.summerCredits, system });
  const bottlenecks = prerequisiteBottlenecks(courses);
  const completedCredits = summary.gpaCredits || summary.earnedCredits || 0;
  const inferredRemaining = plan.terms.reduce((sum, term) => sum + finite(term.credits), 0);
  const remainingCredits = program ? Math.max(0, program.totalCreditsRequired - summary.earnedCredits) : inferredRemaining;
  let activeTab = "overview";
  let policyCatalog = null;
  let anonymize = false;
  let transferResults = [];
  const nextAction = nextActionFor(summary, audit, plan, bottlenecks);

  function persistSettings() {
    Storage.set(COMMAND_SETTINGS_KEY, settings);
  }

  function tab(id, label) {
    return `<button type="button" role="tab" aria-selected="${activeTab === id}" class="${activeTab === id ? "is-active" : ""}" data-command-tab="${id}">${label}</button>`;
  }

  function metric(label, value, note = "") {
    return `<article><span>${esc(label)}</span><strong>${esc(value)}</strong>${note ? `<small>${esc(note)}</small>` : ""}</article>`;
  }

  function overviewPanel() {
    const forecast = trajectoryData(semesters, plan, summary.gpa || 0, summary.gpaCredits || 0, system?.maxGpa || 4, settings.expectedAverage);
    const projectedGpa = forecast.projected.at(-1)?.realistic ?? summary.gpa;
    const nearestIncomplete = audit?.groups?.find((group) => group.status !== "complete")?.name || (plan.blockedCourses[0]?.code || "Set up Degree Audit");
    const delayRisk = summary.issues.length + plan.blockedCourses.length + (bottlenecks[0]?.unlocks ? 1 : 0);
    return `<section class="command-panel command-overview" role="tabpanel">
      <div class="command-status-banner ${delayRisk ? "has-risk" : "is-good"}"><div><span>${delayRisk ? "Attention recommended" : "On track"}</span><h3>${plan.terms.length ? `Estimated completion: ${futureTermLabel(plan.terms.length)}` : "Your current academic record is up to date"}</h3><p>${bottlenecks[0]?.unlocks ? `${bottlenecks[0].code} can unlock ${bottlenecks[0].unlocks} later courses, so it should be prioritized.` : "Add planned courses and prerequisites for a more precise graduation forecast."}</p></div><a class="btn btn--primary" href="${routeHref(nextAction.route)}">${esc(nextAction.label)}</a></div>
      <div class="command-metric-grid">
        ${metric("Current GPA", summary.gpa == null ? "—" : score(summary.gpa, 3), `of ${system?.maxGpa || 4}`)}
        ${metric("Credits completed", score(summary.earnedCredits, 1), "Confirmed earned credits")}
        ${metric("Credits remaining", program ? score(remainingCredits, 1) : "Needs programme total", program ? `${program.totalCreditsRequired} required` : "Add official total")}
        ${metric("Expected graduation GPA", projectedGpa == null ? "—" : score(projectedGpa, 3), "Realistic scenario")}
        ${metric("Nearest incomplete requirement", nearestIncomplete, audit ? "From Degree Audit" : "Audit not configured")}
        ${metric("Expected semesters", plan.terms.length || "—", plan.blockedCourses.length ? `${plan.blockedCourses.length} blocked course(s)` : "Using 18-credit limit")}
        ${metric("Delay risks", delayRisk, "Organizational warnings, not certainty")}
      </div>
      <section class="command-next-card"><span>Recommended next action</span><div><h3>${esc(nextAction.title)}</h3><p>${esc(nextAction.body)}</p></div><a href="${routeHref(nextAction.route)}">Open →</a></section>
      <div class="command-two-column"><section><div class="command-section-head"><div><span>GPA TRAJECTORY</span><h3>Actual and projected path</h3></div><a href="#" data-command-tab-link="goals">Adjust goal</a></div>${trajectoryChart(forecast, system?.maxGpa || 4, settings.target)}</section><section><div class="command-section-head"><div><span>DEGREE AUDIT</span><h3>Requirement progress</h3></div><a href="${routeHref("degree-audit")}">Edit audit</a></div>${auditRings(audit)}</section></div>
    </section>`;
  }

  function roadmapPanel(customPlan = plan) {
    const past = semesters.map((semester) => ({ name: semester.name, courses: semester.courses, credits: semester.credits, gpa: semester.gpa, kind: "past" }));
    const currentCourses = summary.courses.filter((course) => course.outcome === "inProgress");
    const current = currentCourses.length ? [{ name: "Current semester", courses: currentCourses, credits: currentCourses.reduce((sum, course) => sum + finite(course.credits), 0), gpa: null, kind: "current" }] : [];
    const future = customPlan.terms.map((term, index) => ({ ...term, name: futureTermLabel(index + 1), gpa: settings.expectedAverage, kind: "planned" }));
    const timeline = [...past, ...current, ...future];
    return `<section class="command-panel" role="tabpanel">
      <div class="command-section-head"><div><span>ACADEMIC ROADMAP</span><h3>Full degree timeline</h3><p>Past terms, the current load, planned semesters, prerequisites, training, and capstone milestones stay in one sequence.</p></div><button class="btn btn--ghost" type="button" id="commandExportCalendar">Export to Calendar</button></div>
      <div class="degree-timeline">${timeline.length ? timeline.map((term, index) => {
        const load = workloadForTerm(term);
        const locked = term.courses.filter((course) => course.prerequisites?.length).length;
        const milestone = term.courses.some((course) => /training|internship/i.test(`${course.type} ${course.name}`)) ? "Training" : term.courses.some((course) => /capstone|graduation|thesis|project/i.test(`${course.type} ${course.name}`)) ? "Capstone" : "Coursework";
        return `<article class="timeline-term timeline-term--${term.kind}"><header><span>${term.kind}</span><strong>${esc(term.name)}</strong><small>${milestone}</small></header><div><b>${score(load.credits, 1)} credits</b><span class="load-pill load-${load.level.toLowerCase().replaceAll(" ", "-")}">${load.level}</span></div><p>Expected GPA: <strong>${term.gpa == null ? "—" : score(term.gpa, 2)}</strong></p><p>${locked} prerequisite-linked · ${load.practical} practical/heavy</p><details><summary>${term.courses.length} courses</summary><ul>${term.courses.map((course) => `<li><span>${esc(anonymize ? "Course hidden" : [course.code, course.name].filter(Boolean).join(" — "))}</span><small>${course.credits ?? "?"} credits${course.prerequisites?.length ? ` · after ${course.prerequisites.join(", ")}` : ""}</small></li>`).join("")}</ul></details>${index === timeline.length - 1 && term.kind === "planned" ? '<em class="graduation-marker">Expected graduation</em>' : ""}</article>`;
      }).join("") : '<div class="command-empty"><strong>No timeline yet.</strong><span>Import completed and planned courses to build it.</span></div>'}</div>
      <section class="bottleneck-card"><div><span>PREREQUISITE BOTTLENECKS</span><h3>Courses that unlock the most downstream work</h3></div>${bottlenecks.length ? `<ol>${bottlenecks.slice(0, 6).map((item) => `<li><strong>${esc(item.code)}</strong><span>${item.unlocks} downstream · ${item.direct} direct</span><p>Delaying this course by one term may delay connected courses if no alternative prerequisite is accepted.</p></li>`).join("")}</ol>` : '<p class="result-note result-note--muted">Add prerequisite codes to planned courses to detect bottlenecks.</p>'}</section>
      ${customPlan.blockedCourses.length ? `<p class="result-note result-note--warn"><strong>${customPlan.blockedCourses.length} course(s) could not be scheduled.</strong> Add missing credits or review prerequisite chains.</p>` : ""}
    </section>`;
  }

  function goalsPanel() {
    const goal = analyzeGoal({ currentGpa: summary.gpa || 0, completedCredits, remainingCredits, targetGpa: settings.target, maxGpa: system?.maxGpa || 4, grades: system?.grades || [] });
    const data = trajectoryData(semesters, plan, summary.gpa || 0, summary.gpaCredits || 0, system?.maxGpa || 4, settings.expectedAverage);
    return `<section class="command-panel" role="tabpanel">
      <div class="command-section-head"><div><span>GOAL PLANNER + GPA TRAJECTORY</span><h3>Set a graduation target that is mathematically honest</h3><p>Every number updates as you change the target or realistic future average.</p></div></div>
      <div class="goal-control-grid"><label class="field"><span>Target graduation GPA</span><input id="commandTarget" type="number" min="0" max="${system?.maxGpa || 4}" step="0.01" value="${settings.target}"></label><label class="field"><span>Realistic future average</span><input id="commandExpected" type="range" min="0" max="${system?.maxGpa || 4}" step="0.05" value="${settings.expectedAverage}"><output>${score(settings.expectedAverage, 2)}</output></label><div class="goal-verdict ${goal.reachable ? "is-reachable" : "is-impossible"}"><span>${goal.reachable ? "Reachable" : "Not reachable with remaining credits"}</span><strong>${goal.reachable ? `${score(goal.required, 3)} average required` : `${score(goal.maxFinal, 3)} maximum final GPA`}</strong></div></div>
      ${trajectoryChart(data, system?.maxGpa || 4, settings.target)}
      <div class="goal-scenario-grid"><article><span>REALISTIC</span><strong>${score(data.projected.at(-1)?.realistic ?? summary.gpa, 3)}</strong><p>Assumes ${score(settings.expectedAverage, 2)} average in remaining planned courses.</p></article><article><span>AMBITIOUS</span><strong>${score(data.projected.at(-1)?.best ?? summary.gpa, 3)}</strong><p>Assumes the maximum grade in every planned course.</p></article><article><span>WORST CASE</span><strong>${score(data.projected.at(-1)?.minimum ?? summary.gpa, 3)}</strong><p>Planning floor only; not a prediction of academic performance.</p></article></div>
      <section class="goal-answer-card"><h3>${goal.reachable ? `To reach ${score(settings.target, 2)}` : "Highest mathematically possible result"}</h3>${goal.reachable ? `<p>You need an average of <strong>${score(goal.required, 3)}</strong> across the remaining <strong>${score(remainingCredits, 1)} credits</strong>.</p><p>Minimum next-term average while preserving the target: <strong>${goal.nextTermMinimum == null ? "—" : score(Math.max(0, goal.nextTermMinimum), 3)}</strong>.</p><div class="grade-mix">${goal.mix.map((grade) => `<span><b>${grade.count}</b> course${grade.count === 1 ? "" : "s"} at ${esc(grade.label)}</span>`).join("") || "Use the university scale above for a course mix."}</div>` : `<p>Even the maximum grade in every remaining course produces <strong>${score(goal.maxFinal, 3)}</strong>.</p>`}</section>
    </section>`;
  }

  function whatIfPanel() {
    const adjustedPlan = buildPlan(courses, { maxCredits: settings.maxCredits, summer: settings.summer, summerCredits: settings.summerCredits || Math.min(9, settings.maxCredits), system });
    const extraTerms = adjustedPlan.terms.length - plan.terms.length;
    const estimatedCost = settings.costPerCredit > 0 ? remainingCredits * settings.costPerCredit : null;
    return `<section class="command-panel" role="tabpanel">
      <div class="command-section-head"><div><span>WHAT-IF LAB</span><h3>Test changes without modifying the approved record</h3><p>These are planning scenarios, not university decisions.</p></div></div>
      <div class="what-if-grid"><label class="field"><span>Major / programme scenario</span><input id="whatMajor" value="${esc(profile?.department || "Current programme")}" placeholder="New major"></label><label class="field"><span>Minor</span><select id="whatMinor"><option>No minor</option><option>Add a minor</option><option>Remove current minor</option></select></label><label class="field"><span>Credits per regular term</span><input id="whatCredits" type="number" min="3" max="30" step="1" value="${settings.maxCredits}"></label><label class="field"><span>Summer study</span><select id="whatSummer"><option value="no" ${settings.summer ? "" : "selected"}>No</option><option value="yes" ${settings.summer ? "selected" : ""}>Yes</option></select></label><label class="field"><span>Estimated cost per credit (optional)</span><input id="whatCost" type="number" min="0" step="1" value="${settings.costPerCredit || ""}"></label><label class="field"><span>Decision to model</span><select id="whatDecision"><option>Defer one course</option><option>Retake a failed course</option><option>Transfer university</option><option>Increase course load</option><option>Reduce course load</option></select></label></div>
      <div class="what-if-results">${metric("Estimated graduation", adjustedPlan.terms.length ? futureTermLabel(adjustedPlan.terms.length) : "Needs planned courses", `${adjustedPlan.terms.length} planned terms`)}${metric("Additional terms", extraTerms > 0 ? `+${extraTerms}` : extraTerms, "Compared with current plan")}${metric("Blocked courses", adjustedPlan.blockedCourses.length, "Needs prerequisite/credit review")}${metric("Credits potentially displaced", "Not assumed", "Requires official equivalency")}${metric("Estimated remaining tuition", estimatedCost == null ? "Add cost per credit" : estimatedCost.toLocaleString(), "Currency chosen by student")}</div>
      <p class="result-note result-note--muted">Changing major, minor, or university never silently discards credits. Use Transfer Evaluator and official programme rules to identify potentially lost credits first.</p>
    </section>`;
  }

  function transferPanel() {
    return `<section class="command-panel" role="tabpanel">
      <div class="command-two-column"><section><div class="command-section-head"><div><span>TRANSFER CREDIT EVALUATOR</span><h3>Estimate possible course matches</h3></div></div><div class="field-grid"><label class="field"><span>Target university</span><input id="transferUniversity" placeholder="University or programme"></label><label class="field field--wide"><span>Target course list</span><textarea id="transferTargets" rows="8" placeholder="CE201 | Structural Analysis | 3\nMATH202 | Engineering Mathematics II | 3"></textarea></label></div><div class="row-actions"><button class="btn btn--primary" id="runTransfer" type="button">Evaluate possible matches</button></div><p class="result-note result-note--warn"><strong>Estimate only.</strong> Only the receiving university can award transfer credit. Medium-confidence results need an official syllabus or course description.</p></section><section><div class="command-section-head"><div><span>ADVISER MODE</span><h3>Prepare a read-only discussion pack</h3></div></div><label class="field"><span>Questions for my adviser</span><textarea id="adviserQuestions" rows="7" placeholder="Can this elective satisfy my major requirement?\nShould I take the prerequisite next term?">${esc(Storage.get(ADVISER_NOTES_KEY, ""))}</textarea></label><label class="consent-check"><input id="anonymizeCourses" type="checkbox" ${anonymize ? "checked" : ""}> Hide course names in screenshots and short exports.</label><div class="row-actions"><a class="btn btn--primary" href="${routeHref("academic-report")}">Open read-only report / PDF</a><button class="btn btn--ghost" type="button" id="downloadShortSummary">Download short summary</button></div><p class="field-note">Advisers can view shared reports but cannot change the student's academic record.</p></section></div>
      <section id="transferOutput">${transferResults.length ? `<div class="record-table-wrap"><table class="intl-table table--wide"><thead><tr><th>Source</th><th>Possible target</th><th>Confidence</th><th>Review status</th></tr></thead><tbody>${transferResults.map((match) => `<tr><td>${esc([match.source.code, anonymize ? "Course hidden" : match.source.name].filter(Boolean).join(" — "))}</td><td>${match.target ? esc([match.target.code, match.target.name].filter(Boolean).join(" — ")) : "—"}</td><td><span class="confidence-chip confidence-${match.confidence >= 80 ? "high" : match.confidence >= 55 ? "medium" : "low"}">${match.confidence}%</span></td><td>${esc(match.decision)}</td></tr>`).join("")}</tbody></table></div>` : ""}</section>
    </section>`;
  }

  function sourcesPanel() {
    const currentPolicy = policyCatalog?.policies ? Object.values(policyCatalog.policies).find((policy) => policy.name.toLowerCase() === String(profile?.university || "").toLowerCase()) : null;
    return `<section class="command-panel" role="tabpanel">
      <div class="command-two-column"><section><div class="command-section-head"><div><span>GRADING SYSTEM LIBRARY</span><h3>${esc(profile?.university || system?.label || "Current grading system")}</h3></div></div><dl class="policy-facts"><div><dt>Scale</dt><dd>${esc(system?.label || "—")}</dd></div><div><dt>Maximum GPA</dt><dd>${esc(system?.maxGpa || "—")}</dd></div><div><dt>A+ policy</dt><dd>${esc(system?.grades?.find((grade) => /^A\+$/.test(grade.label))?.points ?? "Not defined separately")}</dd></div><div><dt>Retake policy</dt><dd>${esc(system?.retakePolicy || "Confirm with university")}</dd></div><div><dt>Policy scope</dt><dd>${esc(currentPolicy?.scope || "Country/university selection; faculty-specific rules still require verification")}</dd></div><div><dt>Version / review</dt><dd>${esc(currentPolicy?.catalogYear || policyCatalog?.reviewedAt || "User-confirmed custom scale")}</dd></div><div><dt>Verification</dt><dd>${esc(currentPolicy?.verification || "Not yet matched to an official source")}</dd></div></dl>${currentPolicy?.sources?.length ? `<ul class="policy-source-list">${currentPolicy.sources.map((source) => `<li><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.label)}</a></li>`).join("")}</ul>` : `<a class="btn btn--ghost" href="${routeHref("resources/university-gpa-policy-directory")}">Open policy directory</a>`}</section><section><div class="command-section-head"><div><span>${L("DATA CONTROLS", "التحكم في البيانات")}</span><h3>${L("Local academic record", "السجل الأكاديمي المحلي")}</h3></div></div><button class="btn btn--ghost danger-text" type="button" id="wipePrivateData">${L("Erase all local academic data", "مسح كل البيانات الأكاديمية المحلية")}</button><a class="btn btn--text" href="/privacy.html">${L("Privacy Policy", "سياسة الخصوصية")}</a><div class="command-shortcuts"><span><kbd>/</kbd> Find a course or tool</span><span><kbd>Ctrl</kbd> + <kbd>K</kbd> Command palette</span><span><kbd>Alt</kbd> + <kbd>A</kbd> Add a course row</span></div></section></div>
    </section>`;
  }

  function panel() {
    if (activeTab === "roadmap") return roadmapPanel();
    if (activeTab === "goals") return goalsPanel();
    if (activeTab === "whatif") return whatIfPanel();
    if (activeTab === "transfer") return transferPanel();
    if (activeTab === "sources") return sourcesPanel();
    return overviewPanel();
  }

  function render() {
    container.innerHTML = `<div class="academic-command-center"><header class="command-header"><div><span class="section-kicker">ACADEMIC COMMAND CENTER</span><h2>Your whole degree, one decision at a time</h2><p>${esc([profile?.university, profile?.college, profile?.department].filter(Boolean).join(" · "))}</p></div><div class="autosave-state"><i></i><span>Saved automatically on this device</span></div></header><nav class="command-tabs" role="tablist" aria-label="Academic command center sections">${tab("overview", "Overview")}${tab("roadmap", "Roadmap")}${tab("goals", "Goals & GPA")}${tab("whatif", "What-if")}${tab("transfer", "Transfer & Adviser")}${tab("sources", L("Sources & data", "المصادر والبيانات"))}</nav>${panel()}</div>`;
    wire();
  }

  function wire() {
    container.querySelectorAll("[data-command-tab]").forEach((button) => button.addEventListener("click", () => { activeTab = button.dataset.commandTab; render(); }));
    container.querySelectorAll("[data-command-tab-link]").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); activeTab = link.dataset.commandTabLink; render(); }));
    container.querySelector("#commandTarget")?.addEventListener("input", (event) => { settings.target = finite(event.target.value, settings.target); persistSettings(); render(); });
    container.querySelector("#commandExpected")?.addEventListener("input", (event) => { settings.expectedAverage = finite(event.target.value, settings.expectedAverage); persistSettings(); render(); });
    container.querySelector("#whatCredits")?.addEventListener("change", (event) => { settings.maxCredits = clamp(finite(event.target.value, 18), 3, 30); persistSettings(); render(); });
    container.querySelector("#whatSummer")?.addEventListener("change", (event) => { settings.summer = event.target.value === "yes"; persistSettings(); render(); });
    container.querySelector("#whatCost")?.addEventListener("change", (event) => { settings.costPerCredit = Math.max(0, finite(event.target.value)); persistSettings(); render(); });
    container.querySelector("#commandExportCalendar")?.addEventListener("click", () => download("instantgpa-roadmap.ics", calendarFile(plan), "text/calendar;charset=utf-8"));
    container.querySelector("#adviserQuestions")?.addEventListener("input", (event) => Storage.set(ADVISER_NOTES_KEY, event.target.value));
    container.querySelector("#anonymizeCourses")?.addEventListener("change", (event) => { anonymize = event.target.checked; render(); });
    container.querySelector("#downloadShortSummary")?.addEventListener("click", () => {
      const notes = Storage.get(ADVISER_NOTES_KEY, "");
      const text = [`InstantGPA adviser summary`, `University: ${profile?.university || "—"}`, `Current GPA: ${summary.gpa == null ? "—" : score(summary.gpa, 3)}`, `Completed credits: ${score(summary.earnedCredits, 1)}`, `Remaining credits: ${program ? score(remainingCredits, 1) : "Programme total required"}`, `Expected graduation: ${plan.terms.length ? futureTermLabel(plan.terms.length) : "Needs plan"}`, `Questions:`, notes || "—", "", "Planning estimate only. Confirm all decisions with the institution."].join("\n");
      download("instantgpa-adviser-summary.txt", text, "text/plain;charset=utf-8");
    });
    container.querySelector("#runTransfer")?.addEventListener("click", () => {
      const targets = String(container.querySelector("#transferTargets")?.value || "").split(/\r?\n/).flatMap((line) => {
        const [code, name, credits] = line.split(/\t|\||,/).map((part) => part.trim());
        return code || name ? [{ code, name: name || code, credits: finite(credits, null) }] : [];
      });
      transferResults = courses.filter((course) => evaluateCourse(course, system).earnsCredit).map((course) => transferMatch(course, targets));
      render();
    });
    container.querySelector("#wipePrivateData")?.addEventListener("click", () => {
      if (!window.confirm(L(
        "Erase the academic profile, courses, plans, scenarios, and local history from this browser? This cannot be undone.",
        "هل تريد مسح الملف الأكاديمي والمواد والخطط والسيناريوهات والسجل المحلي من هذا المتصفح؟ لا يمكن التراجع عن ذلك.",
      ))) return;
      Storage.clearAll();
      location.assign(routeHref("home"));
    });
  }

  render();
  fetch("/data/university-policies.json").then((response) => response.ok ? response.json() : null).then((data) => {
    policyCatalog = data;
    if (activeTab === "sources") render();
  }).catch(() => {});
}
