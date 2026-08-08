import { AcademicProfile } from "./academic-profile.js";
import { AcademicRecord } from "./academic-record.js";
import { AcademicState } from "./academic-state.js";
import { CloudSync } from "./cloud-sync.js";
import { GradingEngine } from "./grading-engine.js";
import { routeHref } from "./app.js";
import { Storage } from "./storage.js";
import { currentLanguage } from "./localization.js";
import { integrationsPanel, wireIntegrationsPanel } from "./pro-integrations.js";
import { extractAcademicDocument } from "./document-reader.js";
const DEFAULT_WORKSPACE = {
  syllabi: [],
  syllabusChats: [],
  twin: null,
  undo: null,
  transfer: null,
  translation: null,
  creditConversion: null,
  integrity: null,
  advisorLinks: [],
  calendarEvents: [],
  integrations: {},
  offeredCourseCodes: [],
  nextTermPlan: null,
  advisorDecisions: [],
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character]);

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const L = (english, arabic) => currentLanguage() === "ar" ? arabic : english;
const locale = () => currentLanguage() === "ar" ? "ar-EG" : "en";
const statusLine = (english, arabic, warn = false) =>
  `<p class="setup-status__text${warn ? " setup-status__text--warn" : ""}">${escapeHtml(L(english, arabic))}</p>`;
const localizedError = (error, english, arabic) =>
  currentLanguage() === "ar" ? arabic : String(error || english);

const courseCodeKey = (value) => String(value || "").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");

function downstreamCourses(selectedCourse, courses) {
  const selectedCode = courseCodeKey(selectedCourse?.code);
  if (!selectedCode) return [];
  return courses.filter((course) => (course.prerequisites || []).some((value) =>
    String(value || "").split(/[|&,/]+/).some((part) => courseCodeKey(part) === selectedCode)));
}

function activeEntitlement(status) {
  const entitlement = status?.entitlement;
  return Boolean(entitlement && entitlement.status === "active");
}

function emptyWorkspace(value) {
  return {
    ...DEFAULT_WORKSPACE,
    ...(value && typeof value === "object" ? value : {}),
    syllabi: Array.isArray(value?.syllabi) ? value.syllabi : [],
    syllabusChats: Array.isArray(value?.syllabusChats) ? value.syllabusChats : [],
    advisorLinks: Array.isArray(value?.advisorLinks) ? value.advisorLinks : [],
    calendarEvents: Array.isArray(value?.calendarEvents) ? value.calendarEvents : [],
    integrations: value?.integrations && typeof value.integrations === "object" ? value.integrations : {},
    offeredCourseCodes: Array.isArray(value?.offeredCourseCodes) ? value.offeredCourseCodes : [],
    advisorDecisions: Array.isArray(value?.advisorDecisions) ? value.advisorDecisions : [],
  };
}

function paywall(reason = "subscription") {
  const signedOut = reason === "signed_out";
  const ownerOnly = reason === "owner_only";
  return `
    <section class="pro-paywall" aria-labelledby="proPaywallTitle">
      <div class="pro-paywall__visual" aria-hidden="true">
        <span>PRO</span><strong>Academic Twin</strong><i>${L("Transcript + Syllabus + Rules + Cost", "الترانسكريبت + السيلابس + القواعد + التكلفة")}</i>
      </div>
      <div>
        <span class="section-kicker">InstantGPA Pro</span>
        <h2 id="proPaywallTitle">${signedOut ? L("Sign in to your paid Premium account", "سجل الدخول إلى حساب Premium المدفوع") : ownerOnly ? L("Premium is temporarily closed", "Premium مغلق مؤقتًا") : L("An active Premium subscription is required", "يلزم اشتراك Premium مدفوع وفعال")}</h2>
        <p>${ownerOnly ? L("Owner access only while InstantGPA Premium is being prepared for launch.", "الدخول متاح للمالك فقط أثناء تجهيز Premium للإطلاق.") : L("Pro analysis is checked on the server before any syllabus, policy, transfer, decision, or adviser workflow runs.", "يتحقق الخادم من صلاحية Premium قبل تشغيل أي مسار للسيلابس أو السياسات أو التحويل أو القرارات أو مشاركة المرشد.")}</p>
        <ul class="pro-check-list">
          <li>${L("Live semester dashboard, cited syllabus chat, and deadline reminders", "لوحة فصل مباشرة ومحادثة سيلابس بمراجع وتذكير بالمواعيد")}</li>
          <li>${L("Three Academic Twin plans with GPA, time, cost, load, and risk", "ثلاث خطط Academic Twin تشمل GPA والوقت والتكلفة والعبء والمخاطر")}</li>
          <li>${L("Academic Undo, official policies, transfer matching, and credit conversion", "Academic Undo وسياسات رسمية ومطابقة التحويل وتحويل الساعات")}</li>
          <li>${L("Document terminology aid, consistency review, and adviser links", "مساعدة المصطلحات ومراجعة الاتساق وروابط المرشد")}</li>
        </ul>
        <div class="row-actions">
          <a class="btn btn--primary" href="${routeHref("pricing")}">${L("Pay with PayPal or card", "الدفع عبر PayPal أو البطاقة")}</a>
          <a class="btn btn--ghost" href="${routeHref("account")}">${L("Existing access? Sign in", "لديك اشتراك؟ سجل الدخول")}</a>
          <a class="btn btn--ghost" href="${routeHref("instantgpa-pro")}">${L("Compare Pro features", "قارن أدوات Pro")}</a>
        </div>
        <p class="field-note">${L("PayPal handles payment approval. Premium activates only after server verification.", "يعالج PayPal موافقة الدفع، ولا يتفعّل Premium إلا بعد تحقق الخادم.")}</p>
      </div>
    </section>`;
}

function proShell(entitlement, institutionAccess = false, workspace = DEFAULT_WORKSPACE) {
  const hasCourses = AcademicState.mergedCourses().some((course) => course.code || course.name);
  const hasSyllabus = Boolean(workspace.syllabi?.length);
  const recommendedTab = hasCourses && !hasSyllabus ? "syllabus" : "semester";
  const recommendedLabel = !hasCourses
    ? L("Import your transcript once so every Premium tool can reuse your courses.", "ارفع الترانسكريبت مرة واحدة لتعيد كل أدوات Premium استخدام موادك.")
    : !hasSyllabus
      ? L("Add your current syllabus to unlock live targets and deadlines.", "أضف السيلابس الحالي لتفعيل الأهداف والمواعيد المباشرة.")
      : L("Review the semester dashboard for deadlines and courses at risk.", "راجع لوحة الفصل لمعرفة المواعيد والمواد المعرضة للخطر.");
  return `
    <section class="pro-header">
      <div>
        <span class="section-kicker">${L("Subscriber workspace · Pro 2.0", "مساحة المشترك · Pro 2.0")}</span>
        <h2>${L("Your live academic operating system", "نظامك الأكاديمي المباشر")}</h2>
        <p>${L("One private workspace connecting the semester, reviewed record, cited syllabus evidence, university rules, transfer options, cost, and risk.", "مساحة خاصة واحدة تربط الفصل والسجل المعتمد وأدلة السيلابس وقواعد الجامعة وخيارات التحويل والتكلفة والمخاطر.")}</p>
      </div>
      <div class="pro-plan-chip"><span>${escapeHtml(entitlement.plan)}</span><strong>${escapeHtml(entitlement.status)}</strong></div>
    </section>
    <section class="pro-tool-navigator" aria-labelledby="proToolNavigatorTitle">
      <div><span class="section-kicker">${L("Recommended next step", "الخطوة التالية المقترحة")}</span><strong>${recommendedLabel}</strong></div>
      ${hasCourses ? `<button type="button" class="btn btn--ghost" data-pro-open="${recommendedTab}">${L("Open recommendation", "فتح المقترح")}</button>` : `<a class="btn btn--primary" href="${routeHref("transcript-import")}">${L("Import transcript", "رفع الترانسكريبت")}</a>`}
      <label><span id="proToolNavigatorTitle">${L("Choose a Premium tool", "اختر أداة Premium")}</span><select id="proToolSelect">
        <optgroup label="${L("Today", "اليوم")}"><option value="semester">${L("Semester dashboard", "لوحة الفصل")}</option><option value="syllabus">${L("Syllabus & deadlines", "السيلابس والمواعيد")}</option><option value="integrations">${L("Calendar & LMS", "التقويم ومنصات الدراسة")}</option></optgroup>
        <optgroup label="${L("Decisions", "القرارات")}"><option value="plan">${L("Next-term plan", "خطة الفصل القادم")}</option><option value="twin">Academic Twin</option><option value="undo">Academic Undo</option><option value="policies">${L("Official policies", "السياسات الرسمية")}</option></optgroup>
        <optgroup label="${L("Transfer & mobility", "التحويل والتنقل")}"><option value="transfer">${L("Transfer matching", "مطابقة التحويل")}</option><option value="translation">${L("Terminology & credits", "المصطلحات والساعات")}</option></optgroup>
        <optgroup label="${L("Review & share", "المراجعة والمشاركة")}"><option value="integrity">${L("Consistency review", "مراجعة الاتساق")}</option><option value="advisor">${L("Adviser report", "تقرير المرشد")}</option></optgroup>
        ${institutionAccess ? `<optgroup label="${L("Institution", "المؤسسة")}"><option value="institution">${L("Institution workspace", "مساحة المؤسسة")}</option></optgroup>` : ""}
      </select></label>
    </section>
    <section id="proPanel-semester" class="pro-panel" role="region" aria-labelledby="proToolNavigatorTitle"></section>
    <section id="proPanel-syllabus" class="pro-panel" role="region" aria-labelledby="proToolNavigatorTitle" hidden></section>
    <section id="proPanel-integrations" class="pro-panel" role="region" aria-labelledby="proToolNavigatorTitle" hidden></section>
    <section id="proPanel-plan" class="pro-panel" role="region" aria-labelledby="proToolNavigatorTitle" hidden></section>
    <section id="proPanel-twin" class="pro-panel" role="region" aria-labelledby="proToolNavigatorTitle" hidden></section>
    <section id="proPanel-undo" class="pro-panel" role="region" aria-labelledby="proToolNavigatorTitle" hidden></section>
    <section id="proPanel-policies" class="pro-panel" role="region" aria-labelledby="proToolNavigatorTitle" hidden></section>
    <section id="proPanel-transfer" class="pro-panel" role="region" aria-labelledby="proToolNavigatorTitle" hidden></section>
    <section id="proPanel-translation" class="pro-panel" role="region" aria-labelledby="proToolNavigatorTitle" hidden></section>
    <section id="proPanel-integrity" class="pro-panel" role="region" aria-labelledby="proToolNavigatorTitle" hidden></section>
    ${institutionAccess ? '<section id="proPanel-institution" class="pro-panel" role="region" aria-labelledby="proToolNavigatorTitle" hidden></section>' : ""}
    <section id="proPanel-advisor" class="pro-panel" role="region" aria-labelledby="proToolNavigatorTitle" hidden></section>
    <div id="proGlobalStatus" class="setup-status" aria-live="polite"></div>`;
}

function parseCourseList(value) {
  const courses = [];
  String(value || "").split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || /^\[\[PAGE \d+\]\]$/.test(line)) return;
    const parts = line.split(/\t|\|/).map((part) => part.trim());
    if (parts.length >= 2) {
      courses.push({
        code: parts[0] || "",
        name: parts[1] || parts[0] || "",
        credits: parts[2] === "" || parts[2] == null ? null : number(parts[2], null),
        description: parts[3] || "",
        learningOutcomes: parts[4] || "",
        level: parts[5] === "" || parts[5] == null ? null : number(parts[5], null),
      });
      return;
    }
    const header = line.match(/^([A-Za-z]{2,8}\s*-?\s*\d{2,4}[A-Za-z]?)\s*[:–—-]\s*(.+?)(?:\s*\((\d+(?:\.\d+)?)\s*(?:credits?|cr|hours?)\))?$/i);
    if (header) {
      courses.push({ code: header[1].replace(/\s+/g, ""), name: header[2], credits: header[3] ? number(header[3], null) : null, description: "", learningOutcomes: "", level: null });
    } else if (courses.length) {
      courses[courses.length - 1].description = `${courses[courses.length - 1].description || ""} ${line}`.trim().slice(0, 2_000);
    }
  });
  return courses.filter((course) => course.code || course.name).slice(0, 300);
}

function formatCourseList(courses) {
  return courses.map((course) => [course.code, course.name, course.credits ?? "", course.description || "", course.learningOutcomes || "", course.level ?? ""].join(" | ")).join("\n");
}

function courseListFromRecord(workspace) {
  return AcademicState.mergedCourses().map((course) => [
    course.code,
    course.name,
    course.credits ?? "",
    (workspace.syllabi || []).find((syllabus) => courseCodeKey(syllabus.courseName) === courseCodeKey(course.code) || String(syllabus.courseName || "").toLowerCase() === String(course.name || "").toLowerCase())?.chunks?.slice(0, 6).map((chunk) => chunk.text).join(" ") || "",
    "",
    "",
  ].join(" | ")).join("\n");
}

function scoreLine(syllabus) {
  const assessments = syllabus.assessments || [];
  const target = number(syllabus.targetScore, 85);
  let earned = 0;
  let remainingWeight = 0;
  assessments.forEach((assessment) => {
    if (assessment.score === "" || assessment.score == null) {
      remainingWeight += number(assessment.weight);
    } else {
      earned += number(assessment.weight) * number(assessment.score) / 100;
    }
  });
  const required = remainingWeight > 0 ? (target - earned) * 100 / remainingWeight : null;
  return { earned, remainingWeight, required };
}

function allAssessments(workspace) {
  return (workspace.syllabi || []).flatMap((syllabus, syllabusIndex) =>
    (syllabus.assessments || []).map((assessment, assessmentIndex) => ({
      ...assessment,
      courseName: syllabus.courseName,
      targetScore: syllabus.targetScore,
      syllabusIndex,
      assessmentIndex,
    })),
  );
}

function semesterPanel(workspace) {
  const syllabi = workspace.syllabi || [];
  const assessments = allAssessments(workspace);
  const now = Date.now();
  const dated = assessments
    .map((assessment) => ({ ...assessment, timestamp: calendarDate(assessment.dueDate)?.getTime() || 0 }))
    .filter((assessment) => assessment.timestamp >= now && (assessment.score === "" || assessment.score == null))
    .sort((a, b) => a.timestamp - b.timestamp);
  const dueSoon = dated.filter((assessment) => assessment.timestamp <= now + 7 * 24 * 60 * 60 * 1_000);
  const atRisk = syllabi.filter((syllabus) => {
    const line = scoreLine(syllabus);
    return line.required != null && line.required > 90;
  });
  const weighted = syllabi.reduce((summary, syllabus) => {
    const line = scoreLine(syllabus);
    summary.earned += line.earned;
    summary.remaining += line.remainingWeight;
    return summary;
  }, { earned: 0, remaining: 0 });
  return `
    <section class="pro-semester-hero">
      <div>
        <span class="section-kicker">${L("Live semester dashboard", "لوحة الفصل المباشرة")}</span>
        <h3>${syllabi.length ? L(`${syllabi.length} connected course${syllabi.length === 1 ? "" : "s"}`, `${syllabi.length} مادة مترابطة`) : L("Connect the first syllabus", "اربط أول سيلابس")}</h3>
        <p>${L("Scores, required averages, risks, and the next deadline update from the evidence used by Academic Twin.", "تتحدث الدرجات والمتوسطات المطلوبة والمخاطر والموعد التالي من الأدلة نفسها التي يستخدمها Academic Twin.")}</p>
      </div>
      <div class="pro-semester-actions">
        <button class="btn btn--primary" type="button" id="enableProReminders">${L("Enable deadline reminders", "تفعيل تذكير المواعيد")}</button>
        <button class="btn btn--ghost" type="button" id="installInstantGpa">${L("Install app", "تثبيت التطبيق")}</button>
      </div>
    </section>
    <div class="pro-dashboard-metrics">
      <article><span>${L("Courses", "المواد")}</span><strong>${syllabi.length}</strong><small>${assessments.length} ${L("assessments", "تقييمات")}</small></article>
      <article><span>${L("Due in 7 days", "خلال 7 أيام")}</span><strong>${dueSoon.length}</strong><small>${dated.length} ${L("future dated", "بتاريخ مستقبلي")}</small></article>
      <article><span>${L("At risk", "معرضة للخطر")}</span><strong>${atRisk.length}</strong><small>${L("Need over 90% on remaining work", "تحتاج أكثر من 90% في المتبقي")}</small></article>
      <article><span>${L("Weighted points", "النقاط الموزونة")}</span><strong>${weighted.earned.toFixed(1)}</strong><small>${weighted.remaining.toFixed(1)}% ${L("still ungraded", "لم تُقيّم بعد")}</small></article>
    </div>
    <div id="proReminderStatus" class="setup-status" aria-live="polite"></div>
    <div class="pro-grid pro-grid--split">
      <section class="tool-card">
        <header class="pro-card-head"><div><span class="section-kicker">${L("Next deadlines", "المواعيد التالية")}</span><h3>${L("What needs attention now", "ما يحتاج انتباهك الآن")}</h3></div></header>
        <div class="pro-deadline-list">
          ${dated.slice(0, 8).map((assessment) => `<article>
            <time datetime="${escapeHtml(new Date(assessment.timestamp).toISOString())}">${new Date(assessment.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>
            <div><strong>${escapeHtml(assessment.label)}</strong><span>${escapeHtml(assessment.courseName)} · ${number(assessment.weight)}%</span></div>
          </article>`).join("") || `<div class="pro-empty"><strong>${L("No future dates detected.", "لم تُكتشف مواعيد مستقبلية.")}</strong><span>${L("Import a searchable syllabus or add due dates in the Syllabus tool.", "ارفع سيلابس قابلًا للبحث أو أضف المواعيد في أداة السيلابس.")}</span></div>`}
        </div>
      </section>
      <section class="tool-card">
        <header class="pro-card-head"><div><span class="section-kicker">${L("Course pulse", "نبض المواد")}</span><h3>${L("Required average by course", "المتوسط المطلوب لكل مادة")}</h3></div></header>
        <div class="pro-course-pulse">
          ${syllabi.map((syllabus, index) => {
            const line = scoreLine(syllabus);
            const required = line.required == null ? null : Math.max(0, line.required);
            const risk = required == null ? "complete" : required > 100 ? "critical" : required > 90 ? "high" : required > 75 ? "watch" : "healthy";
            return `<button type="button" data-open-syllabus="${index}" class="is-${risk}">
              <span>${escapeHtml(syllabus.courseName || L(`Course ${index + 1}`, `المادة ${index + 1}`))}</span>
              <strong>${required == null ? `${line.earned.toFixed(1)} ${L("earned", "مكتسب")}` : `${required.toFixed(1)}% ${L("needed", "مطلوب")}`}</strong>
            </button>`;
          }).join("") || `<div class="pro-empty"><strong>${L("No live course pulse yet.", "لا يوجد نبض مواد حتى الآن.")}</strong><span>${L("Add a syllabus to begin.", "أضف سيلابس للبدء.")}</span></div>`}
        </div>
      </section>
    </div>`;
}

function syllabusPanel(workspace) {
  const syllabi = workspace.syllabi || [];
  const system = GradingEngine.getActive();
  const connectedCourses = AcademicState.recordSummary(system).courses.filter((course) => ["inProgress", "planned"].includes(course.outcome));
  const suggestedCourse = connectedCourses[0]?.name || connectedCourses[0]?.code || "";
  const targetBand = (system?.grades || []).find((grade) => /^A(?:\+|-)?$/i.test(String(grade.label || "")));
  const suggestedTarget = Number.isFinite(Number(targetBand?.min)) ? Number(targetBand.min) : 85;
  return `
    <div class="pro-grid pro-grid--split">
      <section class="tool-card">
        <span class="section-kicker">${L("01 · Read the course rules", "01 · قراءة قواعد المادة")}</span>
        <h3>${L("Import a syllabus", "رفع السيلابس")}</h3>
        <p class="tool-sub">${L("Choose a current course and syllabus. InstantGPA extracts assessment weights and dates for the live dashboard.", "اختر مادة حالية وسيلابسها. يستخرج InstantGPA أوزان التقييمات ومواعيدها للوحة المباشرة.")}</p>
        <div class="field-grid">
          <label class="field"><span>${L("Course", "المادة")}</span><input id="proSyllabusCourse" list="proSyllabusCourses" maxlength="120" value="${escapeHtml(suggestedCourse)}" placeholder="${L("Choose or type a course", "اختر مادة أو اكتبها")}"><datalist id="proSyllabusCourses">${connectedCourses.map((course) => `<option value="${escapeHtml(course.name || course.code)}">`).join("")}</datalist></label>
          <label class="field"><span>${L("Target final score", "الدرجة النهائية المستهدفة")}</span><input id="proSyllabusTarget" type="number" min="0" max="100" step="0.1" value="${suggestedTarget}"></label>
        <label class="field field--wide"><span>${L("Syllabus PDF, image, or text", "ملف السيلابس PDF أو صورة أو نص")}</span><input id="proSyllabusFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.md,application/pdf,image/*,text/plain"><small>${L("Searchable PDFs are read directly; scanned pages use OCR.", "تُقرأ ملفات PDF القابلة للبحث مباشرة، وتستخدم الصفحات المصورة OCR.")}</small></label>
        </div>
        <div class="row-actions"><button class="btn btn--primary" type="button" id="proParseSyllabus">${L("Extract assessments", "استخراج التقييمات")}</button></div>
        <div id="proSyllabusStatus" class="setup-status" aria-live="polite"></div>
      </section>
      <section class="tool-card pro-value-card">
        <span class="section-kicker">${L("Live grade target", "هدف الدرجة المباشر")}</span>
        <h3>${L("Know what each remaining assessment requires", "اعرف المطلوب في كل تقييم متبقٍ")}</h3>
        <p>${L("Add achieved scores after extraction. The required average updates automatically and invalid total weights are flagged.", "أضف الدرجات المحققة بعد الاستخراج. يتحدث المتوسط المطلوب تلقائيًا وتظهر الأوزان غير الصحيحة.")}</p>
        <div class="pro-mini-flow"><span>${L("Syllabus", "السيلابس")}</span><i>→</i><span>${L("Assessments", "التقييمات")}</span><i>→</i><span>${L("Calendar", "التقويم")}</span><i>→</i><strong>${L("Target", "الهدف")}</strong></div>
      </section>
    </div>
    <section class="pro-stack" id="proSyllabusList">
      ${syllabi.length ? syllabi.map(renderSyllabus).join("") : `<div class="pro-empty"><strong>${L("No syllabus imported yet.", "لم يُرفع سيلابس حتى الآن.")}</strong><span>${L("Import one to extract assessments and deadlines.", "ارفع واحدًا لاستخراج التقييمات والمواعيد.")}</span></div>`}
    </section>
    <section class="tool-card tool-card--wide pro-syllabus-chat">
      <div class="pro-card-head">
        <div><span class="section-kicker">${L("Chat with Syllabus", "محادثة السيلابس")}</span><h3>${L("Ask only what the document can support", "اسأل عما يدعمه المستند فقط")}</h3><p>${L("Every answer includes line evidence. Unsupported questions are refused instead of guessed.", "تتضمن كل إجابة دليلًا من السطور، وتُرفض الأسئلة غير المدعومة بدل التخمين.")}</p></div>
        <div class="pro-confidence"><span>${L("Grounding", "الاستناد")}</span><strong>${L("Line citations", "مراجع السطور")}</strong></div>
      </div>
      <div class="pro-chat-controls">
        <label class="field"><span>${L("Syllabus", "السيلابس")}</span><select id="proChatSyllabus">
          ${syllabi.map((syllabus, index) => `<option value="${index}">${escapeHtml(syllabus.courseName || `Course ${index + 1}`)}</option>`).join("") || '<option value="">Import a syllabus first</option>'}
        </select></label>
        <label class="field"><span>${L("Question", "السؤال")}</span><input id="proChatQuestion" maxlength="500" placeholder="${L("When is the next assessment and how much is it worth?", "متى التقييم التالي وما وزنه؟")}"></label>
        <button class="btn btn--primary" id="askSyllabus" type="button" ${syllabi.length ? "" : "disabled"}>${L("Ask with evidence", "اسأل مع الدليل")}</button>
      </div>
      <div id="proChatStatus" class="setup-status" aria-live="polite"></div>
      <div id="proChatHistory" class="pro-chat-history">
        ${(workspace.syllabusChats || []).slice(0, 8).map(renderChatMessage).join("") || `<div class="pro-empty"><strong>${L("No syllabus question yet.", "لا يوجد سؤال عن السيلابس بعد.")}</strong><span>${L("Ask about a due date, weight, attendance, exam, or prerequisite.", "اسأل عن موعد أو وزن أو حضور أو امتحان أو متطلب سابق.")}</span></div>`}
      </div>
    </section>`;
}

function renderChatMessage(message) {
  return `<article>
    <div class="pro-chat-question"><span>${L("You asked", "سؤالك")}</span><strong>${escapeHtml(message.question)}</strong></div>
    <div class="pro-chat-answer"><span>${escapeHtml(message.confidence || L("evidence", "الدليل"))} ${L("confidence", "ثقة")}</span><p>${escapeHtml(message.answer)}</p>
      ${(message.citations || []).length ? `<ol>${message.citations.map((citation) => `<li><strong>${L("Line", "السطر")} ${citation.lineStart}${citation.lineEnd !== citation.lineStart ? `–${citation.lineEnd}` : ""}</strong> ${escapeHtml(citation.excerpt)}</li>`).join("")}</ol>` : ""}
    </div>
  </article>`;
}

function renderSyllabus(syllabus, index) {
  const line = scoreLine(syllabus);
  const totalWeight = (syllabus.assessments || []).reduce((sum, assessment) => sum + number(assessment.weight), 0);
  const requiredLabel = line.required == null
    ? `${line.earned.toFixed(1)} ${L("weighted points recorded", "نقطة موزونة مسجلة")}`
    : line.required > 100
      ? L(`Target is not reachable from the remaining ${line.remainingWeight.toFixed(1)}%`, `لا يمكن بلوغ الهدف من نسبة ${line.remainingWeight.toFixed(1)}% المتبقية`)
      : `${Math.max(0, line.required).toFixed(1)}% ${L("average needed on remaining work", "متوسط مطلوب في المتبقي")}`;
  return `
    <article class="tool-card tool-card--wide pro-syllabus-card" data-syllabus-index="${index}">
      <header class="pro-card-head">
        <div><span class="section-kicker">${L("Course syllabus", "سيلابس المادة")}</span><h3>${escapeHtml(syllabus.courseName || L(`Course ${index + 1}`, `المادة ${index + 1}`))}</h3><p>${escapeHtml(syllabus.fileName || L("Imported syllabus", "سيلابس مرفوع"))} · ${L("target", "الهدف")} ${number(syllabus.targetScore, 85)}%</p></div>
        <div class="pro-target-ring"><strong>${line.required == null ? line.earned.toFixed(0) : Math.max(0, line.required).toFixed(0)}</strong><span>${line.required == null ? L("earned", "مكتسب") : L("needed", "مطلوب")}</span></div>
      </header>
      <p class="result-note ${line.required != null && line.required > 100 ? "result-note--warn" : ""}"><strong>${escapeHtml(requiredLabel)}</strong> · ${L("detected weights", "الأوزان المكتشفة")} ${totalWeight.toFixed(1)}%.</p>
      ${syllabus.warnings?.length ? `<ul class="pro-warning-list">${syllabus.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : ""}
      <div class="record-table-wrap">
        <table class="intl-table table--wide">
          <thead><tr><th>${L("Assessment", "التقييم")}</th><th>${L("Weight", "الوزن")}</th><th>${L("Due", "الموعد")}</th><th>${L("Your score", "درجتك")}</th><th>${L("Source", "المصدر")}</th></tr></thead>
          <tbody>${(syllabus.assessments || []).map((assessment, assessmentIndex) => `<tr>
            <td><input data-syllabus-field="label" data-assessment-index="${assessmentIndex}" value="${escapeHtml(assessment.label)}" maxlength="100"></td>
            <td><input data-syllabus-field="weight" data-assessment-index="${assessmentIndex}" type="number" min="0" max="100" step="0.1" value="${assessment.weight ?? ""}">%</td>
            <td><input data-syllabus-field="dueDate" data-assessment-index="${assessmentIndex}" type="date" value="${escapeHtml(assessment.dueDate || "")}"></td>
            <td><input data-syllabus-field="score" data-assessment-index="${assessmentIndex}" type="number" min="0" max="100" step="0.1" value="${assessment.score ?? ""}" placeholder="${L("Pending", "معلق")}">%</td>
            <td>${assessment.sourcePage ? `${L("Page", "صفحة")} ${assessment.sourcePage} · ` : ""}${L("Line", "السطر")} ${assessment.sourceLine || "—"}<br><small>${Number.isFinite(Number(assessment.confidence)) ? `${Math.round(Number(assessment.confidence))}% ${L("confidence", "ثقة")}` : L("Unverified", "غير مؤكد")}</small></td>
          </tr>`).join("") || `<tr><td colspan="5">${L("No structured assessments were detected. Add them manually after saving a clearer syllabus.", "لم تُكتشف تقييمات منظمة. أضفها يدويًا بعد رفع سيلابس أوضح.")}</td></tr>`}</tbody>
        </table>
      </div>
      <div class="row-actions">
        <button class="btn btn--primary" type="button" data-save-syllabus="${index}">${L("Save scores", "حفظ الدرجات")}</button>
        <button class="btn btn--ghost" type="button" data-export-syllabus="${index}">${L("Export calendar", "تصدير التقويم")}</button>
        <button class="btn btn--text" type="button" data-delete-syllabus="${index}">${L("Delete", "حذف")}</button>
      </div>
    </article>`;
}

function twinPanel(workspace) {
  const system = GradingEngine.getActive() || { maxGpa: 4 };
  const summary = AcademicState.cumulativeSummary(system);
  const requirements = AcademicRecord.programRequirements();
  const settings = Storage.get("commandCenterSettings:v1", {}) || {};
  const remaining = requirements?.totalCreditsRequired
    ? Math.max(0, requirements.totalCreditsRequired - summary.earnedCredits)
    : 60;
  const maxCredits = Math.max(3, number(settings.maxCredits, 18));
  const estimatedTerms = Math.max(1, Math.ceil(remaining / maxCredits));
  return `
    <div class="pro-grid pro-grid--split">
      <section class="tool-card">
        <span class="section-kicker">${L("02 · Decision simulator", "02 · محاكي القرارات")}</span>
        <h3>${L("Build three paths to your target", "ابنِ ثلاثة مسارات لهدفك")}</h3>
        <div class="field-grid">
          <label class="field"><span>${L("Current GPA", "GPA الحالي")}</span><input id="twinCurrentGpa" type="number" min="0" max="${system.maxGpa || 4}" step="0.001" value="${summary.gpa ?? 0}"></label>
          <label class="field"><span>${L("Completed GPA credits", "ساعات GPA المكتملة")}</span><input id="twinCompletedCredits" type="number" min="0" max="1000" step="0.5" value="${summary.gpaCredits || 0}"></label>
          <label class="field"><span>${L("Remaining credits", "الساعات المتبقية")}</span><input id="twinRemainingCredits" type="number" min="1" max="1000" step="0.5" value="${remaining || 60}"></label>
          <label class="field"><span>${L("Target GPA", "GPA المستهدف")}</span><input id="twinTargetGpa" type="number" min="0" max="${system.maxGpa || 4}" step="0.01" value="${number(settings.target, Math.min(system.maxGpa || 4, 3.5))}"></label>
          <label class="field"><span>${L("Terms available", "الفصول المتاحة")}</span><input id="twinTerms" type="number" min="1" max="30" step="1" value="${estimatedTerms}"></label>
          <label class="field"><span>${L("Cost per credit", "تكلفة الساعة")}</span><input id="twinCost" type="number" min="0" max="1000000" step="1" value="${number(settings.costPerCredit, 0)}"></label>
        </div>
        <div class="row-actions"><button class="btn btn--primary" type="button" id="runAcademicTwin">${L("Generate Academic Twin plans", "إنشاء خطط Academic Twin")}</button></div>
        <div id="twinStatus" class="setup-status" aria-live="polite"></div>
      </section>
      <section class="tool-card pro-value-card">
        <span class="section-kicker">${L("Evidence boundary", "حدود الدليل")}</span>
        <h3>${L("Every plan shows its assumptions", "كل خطة تعرض افتراضاتها")}</h3>
        <p>${L("Plans compare GPA feasibility, terms, load, estimated tuition, study time, and risk. University policy remains authoritative.", "تقارن الخطط إمكانية GPA والفصول والعبء والتكلفة والوقت والمخاطر، وتظل سياسة الجامعة هي المرجع الرسمي.")}</p>
      </section>
    </div>
    <div id="twinResults">${workspace.twin ? renderTwin(workspace.twin) : `<div class="pro-empty"><strong>${L("No Academic Twin scenario yet.", "لا يوجد سيناريو Academic Twin بعد.")}</strong><span>${L("Use your current record or enter a hypothetical case.", "استخدم سجلك الحالي أو أدخل حالة افتراضية.")}</span></div>`}</div>`;
}

function renderTwin(twin) {
  const required = number(twin.requiredAverage);
  return `
    <section class="tool-card tool-card--wide">
      <header class="pro-card-head">
        <div><span class="section-kicker">${L("Academic Twin result", "نتيجة Academic Twin")}</span><h3>${twin.achievable ? L("Target is mathematically reachable", "الهدف ممكن حسابيًا") : L("Target exceeds the available GPA ceiling", "الهدف يتجاوز أقصى GPA متاح")}</h3><p>${L("Required average across remaining credits", "المتوسط المطلوب في الساعات المتبقية")}: <strong>${required.toFixed(3)}</strong>.</p></div>
        <div class="pro-confidence"><span>${L("Confidence", "الثقة")}</span><strong>${escapeHtml(twin.confidence || L("medium", "متوسطة"))}</strong></div>
      </header>
      <div class="pro-scenario-grid">${(twin.scenarios || []).map((scenario) => `
        <article class="pro-scenario pro-scenario--${scenario.id}">
          <span>${escapeHtml(scenario.label)}</span>
          <strong>${scenario.achievable ? `${number(scenario.requiredAverage).toFixed(2)} ${L("GPA avg", "متوسط GPA")}` : L("Not achievable", "غير ممكن")}</strong>
          <dl>
            <div><dt>${L("Terms", "الفصول")}</dt><dd>${scenario.terms}</dd></div>
            <div><dt>${L("Credits / term", "الساعات / فصل")}</dt><dd>${scenario.creditsPerTerm}</dd></div>
            <div><dt>${L("Study / week", "دراسة / أسبوع")}</dt><dd>${scenario.weeklyStudyHours} ${L("h", "س")}</dd></div>
            <div><dt>${L("Tuition estimate", "التكلفة التقديرية")}</dt><dd>${scenario.estimatedTuition ? number(scenario.estimatedTuition).toLocaleString(locale()) : L("Add cost", "أضف التكلفة")}</dd></div>
            <div><dt>${L("Risk", "المخاطر")}</dt><dd>${escapeHtml(scenario.risk)}</dd></div>
          </dl>
          <details><summary>${L("Assumptions", "الافتراضات")}</summary><ul>${(scenario.assumptions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>
        </article>`).join("")}</div>
    </section>`;
}

function undoPanel(workspace, policyData) {
  const system = GradingEngine.getActive() || { maxGpa: 4 };
  const summary = AcademicState.cumulativeSummary(system);
  const requirements = AcademicRecord.programRequirements();
  const settings = Storage.get("commandCenterSettings:v1", {}) || {};
  const remaining = requirements?.totalCreditsRequired
    ? Math.max(1, requirements.totalCreditsRequired - summary.earnedCredits)
    : 60;
  const policies = policyData?.entries || [];
  const allCourses = AcademicState.mergedCourses();
  const courseChoices = allCourses
    .filter((course) => course.code || course.name)
    .filter((course) => !["planned", "unknown"].includes(String(course.status || "").toLowerCase()))
    .sort((a, b) => Number(String(b.status).includes("progress")) - Number(String(a.status).includes("progress")));
  const initialCourse = courseChoices.find((course) => String(course.status).includes("progress") || String(course.grade || "").trim().toUpperCase() === "U") || courseChoices[0];
  const initialCredits = Math.max(0, number(initialCourse?.credits, 0));
  const initialAffected = downstreamCourses(initialCourse, allCourses).map((course) => course.code || course.name).filter(Boolean);
  const evidenceCount = allCourses.filter((course) => Number.isFinite(Number(course.credits)) && (course.grade || course.points != null)).length;
  const beforeUncertainty = evidenceCount >= 12 ? 0.18 : evidenceCount >= 6 ? 0.25 : 0.35;
  const afterUncertainty = Math.max(0.1, Math.round(beforeUncertainty * 0.8 * 100) / 100);
  const profile = AcademicProfile.get();
  const profileInstitution = String(profile?.university || "").toLowerCase();
  const suggestedPolicy = policies.find((entry) => {
    const institution = String(entry.institution || "").toLowerCase();
    return institution && profileInstitution && (institution.includes(profileInstitution) || profileInstitution.includes(institution));
  });
  return `
    <div class="pro-grid pro-grid--split">
      <section class="tool-card">
        <span class="section-kicker">Academic Undo Button™</span>
        <h3>${L("Test a hard-to-reverse decision first", "اختبر القرار الذي يصعب التراجع عنه أولًا")}</h3>
        <p class="tool-sub">${L("InstantGPA runs 5,000 deterministic scenarios using your record and adjustable assumptions, then compares target, scholarship, cost, delay, prerequisites, deadline, and policy.", "يشغّل InstantGPA عدد 5,000 سيناريو محدد باستخدام سجلك وافتراضات قابلة للتعديل، ثم يقارن الهدف والمنحة والتكلفة والتأخير والمتطلبات والموعد والسياسة.")}</p>
        <div class="field-grid">
          <label class="field field--wide"><span>${L("Decision", "القرار")}</span><select id="undoDecision">
            <option value="Withdraw from a course">${L("Withdraw from a course", "الانسحاب من مادة")}</option>
            <option value="Retake a course">${L("Retake a course", "إعادة مادة")}</option>
            <option value="Reduce semester load">${L("Reduce semester load", "تقليل عبء الفصل")}</option>
            <option value="Transfer university">${L("Transfer university", "التحويل إلى جامعة أخرى")}</option>
            <option value="Change major">${L("Change major", "تغيير التخصص")}</option>
          </select></label>
          <label class="field field--wide"><span>${L("Affected course", "المادة المتأثرة")}</span><select id="undoCourse"><option value="">${L("No single course", "لا توجد مادة واحدة")}</option>${courseChoices.map((course) => `<option value="${escapeHtml(course.attemptId)}" ${course.attemptId === initialCourse?.attemptId ? "selected" : ""}>${escapeHtml([course.code, course.name].filter(Boolean).join(" — "))} · ${number(course.credits, 0)} ${L("credits", "ساعات")} · ${escapeHtml(course.grade || course.status)}</option>`).join("")}</select><small>${L("Courses already in your record are offered first; future courses are excluded.", "تظهر مواد سجلك أولًا، وتُستبعد المواد المستقبلية.")}</small></label>
          <label class="field"><span>${L("Expected average after decision", "المتوسط المتوقع بعد القرار")}</span><input id="undoAfterAverage" type="number" min="0" max="${system.maxGpa || 4}" step="0.01" value="${Math.min(system.maxGpa || 4, Math.max(0, summary.gpa || 3) + 0.15)}"></label>
        </div>
        <details class="tool-details">
          <summary>${L("Advanced assumptions — already filled from your academic record", "افتراضات متقدمة — مملوءة من سجلك الأكاديمي")}</summary>
          <div class="field-grid">
          <label class="field"><span>${L("Current GPA", "GPA الحالي")}</span><input id="undoCurrentGpa" type="number" min="0" max="${system.maxGpa || 4}" step="0.001" value="${summary.gpa ?? 0}"></label>
          <label class="field"><span>${L("Completed GPA credits", "ساعات GPA المكتملة")}</span><input id="undoCompletedCredits" type="number" min="0" max="1000" step="0.5" value="${summary.gpaCredits || 0}"></label>
          <label class="field"><span>${L("Remaining credits", "الساعات المتبقية")}</span><input id="undoRemainingCredits" type="number" min="1" max="1000" step="0.5" value="${remaining}"></label>
          <label class="field"><span>${L("Target GPA", "GPA المستهدف")}</span><input id="undoTargetGpa" type="number" min="0" max="${system.maxGpa || 4}" step="0.01" value="${number(settings.target, Math.min(system.maxGpa || 4, 3.5))}"></label>
          <label class="field"><span>${L("Expected future average now", "المتوسط المستقبلي المتوقع حاليًا")}</span><input id="undoBeforeAverage" type="number" min="0" max="${system.maxGpa || 4}" step="0.01" value="${Math.max(0, summary.gpa || 3)}"></label>
          <label class="field"><span>${L("Current uncertainty ± GPA", "عدم اليقين الحالي ± GPA")}</span><input id="undoBeforeUncertainty" type="number" min="0.01" max="${system.maxGpa || 4}" step="0.01" value="${beforeUncertainty}"></label>
          <label class="field"><span>${L("After-decision uncertainty ± GPA", "عدم اليقين بعد القرار ± GPA")}</span><input id="undoAfterUncertainty" type="number" min="0.01" max="${system.maxGpa || 4}" step="0.01" value="${afterUncertainty}"></label>
          <label class="field"><span>${L("Scholarship GPA floor", "الحد الأدنى لـGPA المنحة")}</span><input id="undoScholarship" type="number" min="0" max="${system.maxGpa || 4}" step="0.01" value="${Math.min(system.maxGpa || 4, 3)}"></label>
          <label class="field"><span>${L("Additional credits", "الساعات الإضافية")}</span><input id="undoAdditionalCredits" type="number" min="0" max="500" step="0.5" value="${initialCredits}"></label>
          <label class="field"><span>${L("Delay in terms", "التأخير بالفصول")}</span><input id="undoDelay" type="number" min="0" max="20" step="1" value="1"></label>
          <label class="field"><span>${L("Extra cost", "التكلفة الإضافية")}</span><input id="undoCost" type="number" min="-1000000" max="1000000" step="1" value="${number(settings.costPerCredit, 0) * initialCredits}"></label>
          <label class="field"><span>${L("Critical deadline", "الموعد الحاسم")}</span><input id="undoDeadline" type="date"></label>
          <label class="field field--wide"><span>${L("Policy source", "مصدر السياسة")}</span><select id="undoPolicy">
            <option value="">${L("No policy selected — result will be low confidence", "لم تُحدد سياسة — ستكون الثقة منخفضة")}</option>
            ${policies.map((entry) => `<option value="${escapeHtml(entry.id)}" ${entry.id === suggestedPolicy?.id ? "selected" : ""}>${escapeHtml(entry.institution)} · ${escapeHtml(entry.country)}</option>`).join("")}
          </select></label>
          <label class="field field--wide"><span>${L("Affected prerequisite courses", "المواد اللاحقة المتأثرة")}</span><textarea id="undoPrerequisites" rows="3" placeholder="${L("Filled from the study plan when available", "تُملأ من الخطة عند توفرها")}">${escapeHtml(initialAffected.join("\n"))}</textarea></label>
          </div>
        </details>
        <div class="row-actions"><button class="btn btn--primary" type="button" id="runAcademicUndo">${L("Run 5,000 decision scenarios", "تشغيل 5,000 سيناريو للقرار")}</button></div>
        <div id="undoStatus" class="setup-status" aria-live="polite"></div>
      </section>
      <section class="tool-card pro-value-card">
        <span class="section-kicker">${L("What makes it different", "ما الذي يميزه")}</span>
        <h3>${L("One decision, every consequence", "قرار واحد وكل نتائجه")}</h3>
        <p>${L("See probability beside GPA range, scholarship, extra cost, delayed terms, prerequisites, deadline, and the official rule.", "شاهد الاحتمال مع نطاق GPA والمنحة والتكلفة والتأخير والمتطلبات والموعد والقاعدة الرسمية.")}</p>
        <div class="pro-mini-flow"><span>${L("Decision", "القرار")}</span><i>→</i><span>${L("5,000 runs", "5,000 تشغيل")}</span><i>→</i><span>${L("Policy", "السياسة")}</span><i>→</i><strong>${L("Reversible choice", "اختيار قابل للمراجعة")}</strong></div>
      </section>
    </div>
    <div id="undoResults">${workspace.undo ? renderUndo(workspace.undo) : `<div class="pro-empty"><strong>${L("No decision simulation yet.", "لا توجد محاكاة قرار بعد.")}</strong><span>${L("Use your own expectation and uncertainty; InstantGPA will not invent a probability.", "استخدم توقعك وعدم اليقين لديك؛ لن يخترع InstantGPA احتمالًا.")}</span></div>`}</div>`;
}

function renderUndo(result) {
  const delta = number(result.impact?.probabilityChange);
  const before = result.before || {};
  const after = result.after || {};
  const formatRange = (range) => Array.isArray(range)
    ? `${number(range[0]).toFixed(2)}–${number(range[1]).toFixed(2)}`
    : "—";
  return `<section class="tool-card tool-card--wide pro-undo-result">
    <header class="pro-card-head">
      <div><span class="section-kicker">${L("Academic Undo result", "نتيجة Academic Undo")} · ${number(result.simulations).toLocaleString(locale())} ${L("scenarios", "سيناريو")}</span><h3>${escapeHtml(result.decision)}</h3><p>${L("Target probability", "احتمال الهدف")} ${number(before.targetProbability).toFixed(1)}% → <strong>${number(after.targetProbability).toFixed(1)}%</strong>.</p></div>
      <div class="pro-probability-change ${delta >= 0 ? "is-positive" : "is-negative"}"><span>${L("Probability change", "تغير الاحتمال")}</span><strong>${delta >= 0 ? "+" : ""}${delta.toFixed(1)} ${L("pts", "نقطة")}</strong></div>
    </header>
    <div class="pro-undo-comparison">
      <article><span>${L("Before", "قبل")}</span><strong>${number(before.targetProbability).toFixed(1)}%</strong><dl><div><dt>${L("95% GPA range", "نطاق GPA بنسبة 95%")}</dt><dd>${formatRange(before.gpaRange95)}</dd></div><div><dt>${L("Scholarship chance", "فرصة المنحة")}</dt><dd>${number(before.scholarshipProbability).toFixed(1)}%</dd></div></dl></article>
      <article class="is-after"><span>${L("After decision", "بعد القرار")}</span><strong>${number(after.targetProbability).toFixed(1)}%</strong><dl><div><dt>${L("95% GPA range", "نطاق GPA بنسبة 95%")}</dt><dd>${formatRange(after.gpaRange95)}</dd></div><div><dt>${L("Scholarship chance", "فرصة المنحة")}</dt><dd>${number(after.scholarshipProbability).toFixed(1)}%</dd></div></dl></article>
    </div>
    <div class="pro-impact-grid">
      <span><strong>${number(result.impact?.delayTerms)}</strong> ${L("delayed terms", "فصول تأخير")}</span>
      <span><strong>${number(result.impact?.extraCost).toLocaleString(locale())}</strong> ${L("extra cost", "تكلفة إضافية")}</span>
      <span><strong>${number(result.impact?.additionalCredits)}</strong> ${L("added credits", "ساعات إضافية")}</span>
      <span><strong>${escapeHtml(String(result.impact?.scholarshipStatus || L("unknown", "غير معروف")).replaceAll("_", " "))}</strong> ${L("scholarship", "المنحة")}</span>
    </div>
    ${result.impact?.deadline ? `<p class="result-note result-note--warn"><strong>${L("Critical deadline", "الموعد الحاسم")}:</strong> ${escapeHtml(result.impact.deadline)}</p>` : ""}
    ${(result.impact?.affectedPrerequisites || []).length ? `<p class="field-note"><strong>${L("Affected prerequisites", "المتطلبات المتأثرة")}:</strong> ${result.impact.affectedPrerequisites.map(escapeHtml).join(", ")}</p>` : ""}
    <div class="pro-evidence-box">
      <strong>${escapeHtml(result.evidence?.policyName || L("No policy selected", "لم تُحدد سياسة"))}</strong>
      ${result.evidence?.policySource ? `<a href="${escapeHtml(result.evidence.policySource)}" target="_blank" rel="noopener">${L("Open official source", "فتح المصدر الرسمي")}</a>` : `<span>${L("Add an official policy before acting.", "أضف سياسة رسمية قبل اتخاذ القرار.")}</span>`}
      ${result.evidence?.effectiveDate ? `<small>${L("Effective", "ساري بتاريخ")} ${escapeHtml(result.evidence.effectiveDate)}</small>` : ""}
    </div>
    <details><summary>${L("Simulation assumptions", "افتراضات المحاكاة")}</summary><ul>${(result.assumptions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>
  </section>`;
}

function policiesPanel(policyData, catalogData) {
  const entries = policyData?.entries || [];
  return `${catalogData?.verified ? `<section class="tool-card tool-card--wide">
    <div class="pro-card-head"><div><span class="section-kicker">${L("Cited policy Q&A", "سؤال وجواب موثّق")}</span><h3>${L("Ask the approved catalog — never the open web", "اسأل الكتالوج المعتمد — وليس الويب المفتوح")}</h3><p>${L("Every supported answer includes the official source and page. If the catalog does not support an answer, InstantGPA says Uncertain.", "كل إجابة مدعومة تتضمن المصدر الرسمي ورقم الصفحة، وإذا لم يدعم الكتالوج الإجابة تظهر «غير مؤكد».")}</p></div></div>
    <div class="pro-policy-toolbar"><label class="field"><span>${L("Question", "السؤال")}</span><input id="officialPolicyQuestion" maxlength="500" placeholder="${L("What is the retake rule for my programme?", "ما قاعدة إعادة المادة في برنامجي؟")}"></label><button id="askOfficialPolicy" class="btn btn--primary" type="button">${L("Answer with sources", "إجابة بالمصادر")}</button></div>
    <div id="officialPolicyAnswer" class="setup-status" aria-live="polite"></div>
  </section>` : `<section class="tool-card"><p class="result-note result-note--warn">${L("No Owner-approved catalog matches this academic profile and year. Policy answers remain uncertain.", "لا يوجد كتالوج اعتمده المالك يطابق ملفك الأكاديمي وسنته؛ لذلك تظل إجابات السياسة غير مؤكدة.")}</p></section>`}<section class="tool-card tool-card--wide">
    <div class="pro-card-head">
      <div><span class="section-kicker">${L("Official-source registry", "سجل المصادر الرسمية")}</span><h3>${L("Catalogs and academic decision rules", "الكتالوجات وقواعد القرارات الأكاديمية")}</h3><p>${L("Verified coverage spans Egypt, the Gulf, the United States, and major international systems. Every entry links to an official source and review date; programme-specific rules stay marked.", "تشمل التغطية الموثقة مصر والخليج والولايات المتحدة وأنظمة دولية كبرى. يرتبط كل سجل بمصدر رسمي وتاريخ مراجعة، وتظل القواعد الخاصة بالبرامج موضحة.")}</p></div>
      <div class="pro-confidence"><span>${L("Coverage", "التغطية")}</span><strong>${entries.length} ${L("institutions", "جامعة")}</strong></div>
    </div>
    <div class="pro-policy-toolbar">
      <label class="field"><span>${L("Search institution, country, or rule", "ابحث عن جامعة أو دولة أو قاعدة")}</span><input id="policySearch" type="search" maxlength="120" placeholder="${L("e.g. withdrawal, Egypt, Qatar", "مثال: انسحاب، مصر، قطر")}"></label>
      <button class="btn btn--ghost" type="button" id="runPolicySearch">${L("Search registry", "بحث السجل")}</button>
    </div>
    <div id="policyStatus" class="setup-status" aria-live="polite"></div>
    <div id="policyCatalog" class="pro-policy-grid">${renderPolicies(entries)}</div>
    <details class="pro-source-notes"><summary>${L("Registry-wide data sources", "مصادر البيانات العامة للسجل")}</summary><ul>${(policyData?.sources || []).map((source) => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${escapeHtml(source.label)}</a> — ${escapeHtml(source.purpose)}</li>`).join("")}</ul></details>
  </section>`;
}

function nextTermPanel(workspace, catalogData) {
  const plan = workspace.nextTermPlan;
  return `<div class="pro-grid pro-grid--split"><section class="tool-card">
    <span class="section-kicker">${L("Source-grounded planning", "تخطيط قائم على المصدر")}</span><h3>${L("Build only from courses actually offered next term", "ابنِ الخطة من المواد المطروحة فعليًا فقط")}</h3>
    <p class="tool-sub">${catalogData?.verified ? L("Your completed courses and approved prerequisites are already connected. Paste only the official offering codes for the coming term.", "موادك المكتملة والمتطلبات المعتمدة متصلة بالفعل. الصق فقط أكواد المواد المطروحة رسميًا للفصل القادم.") : L("An approved catalog is required before planning. InstantGPA will not guess prerequisites.", "يلزم كتالوج معتمد قبل التخطيط، ولن يخمّن InstantGPA المتطلبات.")}</p>
    <label class="field"><span>${L("Official offered course codes", "أكواد المواد المطروحة رسميًا")}</span><textarea id="offeredCourseCodes" rows="7" placeholder="CS301\nCS315\nMATH240">${escapeHtml((workspace.offeredCourseCodes || []).join("\n"))}</textarea><small>${L("Copy from the live registration portal. One code per line or comma-separated.", "انسخها من بوابة التسجيل المباشرة، كود لكل سطر أو مفصولة بفاصلة.")}</small></label>
    <label class="field"><span>${L("Maximum credits", "الحد الأقصى للساعات")}</span><input id="nextTermMaxCredits" type="number" min="1" max="30" value="${number((Storage.get("commandCenterSettings:v1", {}) || {}).maxCredits, 18)}"></label>
    <button id="buildNextTermPlan" class="btn btn--primary" type="button" ${catalogData?.verified ? "" : "disabled"}>${L("Build verified plan", "إنشاء خطة موثقة")}</button><div id="nextTermPlanStatus" class="setup-status" aria-live="polite"></div>
  </section><section class="tool-card">${plan ? renderNextTermPlan(plan) : `<div class="pro-empty"><strong>${L("No verified plan yet.", "لا توجد خطة موثقة بعد.")}</strong><span>${L("The planner will exclude completed, future-unoffered, and prerequisite-blocked courses.", "سيستبعد المخطط المواد المكتملة وغير المطروحة والموقوفة بمتطلبات سابقة.")}</span></div>`}</section></div>`;
}

function renderNextTermPlan(plan) {
  return `<span class="section-kicker">${plan.verified ? L("Verified inputs", "مدخلات موثقة") : L("Uncertain", "غير مؤكد")}</span><h3>${L("Recommended next term", "الفصل القادم المقترح")}</h3>
    <p class="result-note ${plan.verified ? "" : "result-note--warn"}">${escapeHtml(plan.message)}</p>
    <div class="pro-deadline-list">${(plan.selected || []).map((course) => `<article><strong>${escapeHtml(course.code)}</strong><div><strong>${escapeHtml(course.title)}</strong><span>${number(course.credits)} ${L("credits", "ساعات")} · ${escapeHtml(course.groupName || "")}${course.citation?.page ? ` · ${L("page", "صفحة")} ${course.citation.page}` : ""}</span></div></article>`).join("") || `<p>${L("No eligible offered course found.", "لم توجد مادة مطروحة ومستوفاة الشروط.")}</p>`}</div>
    <p><strong>${L("Total", "الإجمالي")}:</strong> ${number(plan.totalCredits)} ${L("credits", "ساعات")}</p>
    ${(plan.blocked || []).length ? `<details><summary>${L("Blocked by prerequisites", "موقوفة بسبب المتطلبات")}</summary><ul>${plan.blocked.map((course) => `<li>${escapeHtml(course.code)} — ${escapeHtml(course.missingPrerequisites.join(", "))}</li>`).join("")}</ul></details>` : ""}<small>${escapeHtml(plan.limitation || "")}</small>`;
}

function renderPolicies(entries) {
  return entries.map((entry) => `<article>
    <header><div><span>${escapeHtml(entry.region)} · ${escapeHtml(entry.country)}</span><h4>${escapeHtml(entry.institution)}</h4></div><strong>${escapeHtml(entry.scale)}</strong></header>
    <p>${escapeHtml(entry.scope)}</p>
    <ul>${(entry.rules || []).map((rule) => `<li><span>${escapeHtml(rule.type)}</span>${escapeHtml(rule.summary)}</li>`).join("")}</ul>
    <footer>
      <a href="${escapeHtml(entry.catalogUrl)}" target="_blank" rel="noopener">${escapeHtml(entry.catalogLabel)}</a>
      <a href="${escapeHtml(entry.policyUrl)}" target="_blank" rel="noopener">${escapeHtml(entry.policyLabel)}</a>
      <small>${L("Reviewed", "رُوجع في")} ${escapeHtml(entry.reviewedAt)}</small>
    </footer>
  </article>`).join("") || `<div class="pro-empty"><strong>${L("No matching policy source.", "لا يوجد مصدر سياسة مطابق.")}</strong><span>${L("Try a country, institution, grading, transfer, withdrawal, or retake.", "جرّب دولة أو جامعة أو تقييمًا أو تحويلًا أو انسحابًا أو إعادة.")}</span></div>`;
}

function transferPanel(workspace) {
  return `
    <div class="pro-grid pro-grid--split">
      <section class="tool-card tool-card--wide">
        <span class="section-kicker">${L("03 · University transfer", "03 · التحويل الجامعي")}</span>
        <h3>${L("Compare source and target courses", "قارن مواد الجامعة الحالية والمستهدفة")}</h3>
        <p class="tool-sub">${L("Use one course per line as", "استخدم مادة في كل سطر بالصيغة")} <strong>${L("code | title | credits | description | learning outcomes | level", "الكود | الاسم | الساعات | الوصف | نواتج التعلم | المستوى")}</strong>. ${L("The first three fields are required; richer evidence produces a stronger comparison.", "أول ثلاثة حقول مطلوبة، وكلما زادت الأدلة أصبحت المقارنة أقوى.")}</p>
        <div class="pro-transfer-inputs">
          <label class="field"><span>${L("Your completed courses", "موادك المكتملة")}</span><textarea id="transferSource" rows="10" placeholder="CE201 | Structural Analysis I | 3 | Beams and frames | Analyze structural systems | 2">${escapeHtml(courseListFromRecord(workspace))}</textarea></label>
        <label class="field"><span>${L("Target university courses", "مواد الجامعة المستهدفة")}</span><textarea id="transferTarget" rows="10" placeholder="CIVL210 | Structural Mechanics | 3 | Structural behavior | Analyze beams and frames | 2"></textarea><input id="transferTargetFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.md,application/pdf,image/*,text/plain"><small>${L("Upload a target catalog to extract course headers and descriptions, then review the normalized rows.", "ارفع كتالوج الجامعة المستهدفة لاستخراج أسماء المواد وأوصافها، ثم راجع الصفوف المنظمة.")}</small></label>
        </div>
        <div class="row-actions"><button class="btn btn--primary" type="button" id="runTransfer">${L("Compare courses", "مقارنة المواد")}</button></div>
        <div id="transferStatus" class="setup-status" aria-live="polite"></div>
      </section>
      <section class="tool-card pro-transfer-boundary">
        <strong>${L("Planning estimate", "تقدير للتخطيط")}</strong>
        <p>${L("A likely match never means awarded credit. The receiving university must confirm equivalency, residency, minimum grade, catalog year, and programme limits.", "التطابق المرجح لا يعني منح ساعات. يجب أن تؤكد الجامعة المستقبلة المعادلة والإقامة والدرجة الدنيا وسنة الكتالوج وحدود البرنامج.")}</p>
      </section>
    </div>
    <div id="transferResults">${workspace.transfer ? renderTransfer(workspace.transfer) : `<div class="pro-empty"><strong>${L("No transfer comparison yet.", "لا توجد مقارنة تحويل بعد.")}</strong><span>${L("Import your transcript first to prefill completed courses.", "ارفع الترانسكريبت أولًا لملء المواد المكتملة تلقائيًا.")}</span></div>`}</div>`;
}

function renderTransfer(result) {
  const counts = (result.matches || []).reduce((map, row) => {
    map[row.decision] = (map[row.decision] || 0) + 1;
    return map;
  }, {});
  return `
    <section class="tool-card tool-card--wide">
      <p class="record-connected">● ${result.semanticAvailable ? L("Multilingual embeddings + structured evidence", "Embeddings متعددة اللغات + أدلة منظمة") : L("Lexical fallback — unverified until semantic evidence is available", "بديل لفظي — غير مؤكد حتى تتوفر الأدلة الدلالية")}</p>
      <div class="pro-inline-metrics">
        <span><strong>${counts.likely_match || 0}</strong> ${L("likely matches", "تطابقات مرجحة")}</span>
        <span><strong>${counts.review || 0}</strong> ${L("need review", "تحتاج مراجعة")}</span>
        <span><strong>${counts.unmatched || 0}</strong> ${L("unmatched", "غير متطابقة")}</span>
      </div>
      <div class="record-table-wrap">
        <table class="intl-table table--wide">
          <thead><tr><th>${L("Source course", "المادة الأصلية")}</th><th>${L("Best target", "أفضل مقابل")}</th><th>${L("Confidence", "الثقة")}</th><th>${L("Decision", "القرار")}</th><th>${L("Reason", "السبب")}</th></tr></thead>
          <tbody>${(result.matches || []).map((row) => `<tr>
            <td><strong>${escapeHtml(row.source.code || "—")}</strong><small>${escapeHtml(row.source.name || "")}</small></td>
            <td>${row.target ? `<strong>${escapeHtml(row.target.code || "—")}</strong><small>${escapeHtml(row.target.name || "")}</small>` : L("No match", "لا يوجد تطابق")}</td>
            <td>${number(row.confidence)}%</td>
            <td><span class="pro-decision pro-decision--${escapeHtml(row.decision)}">${row.decision === "likely_match" ? L("likely match", "تطابق مرجح") : row.decision === "review" ? L("review", "مراجعة") : L("unmatched", "غير متطابق")}</span></td>
            <td>${escapeHtml(row.reason)}${row.evidence ? `<details><summary>${L("Evidence", "الأدلة")}</summary><small>${L("Code", "الكود")} ${number(row.evidence.code)}% · ${L("title", "الاسم")} ${number(row.evidence.title)}% · ${L("learning", "النواتج")} ${number(row.evidence.learning)}% · ${L("credits", "الساعات")} ${number(row.evidence.credits)}% · ${L("level", "المستوى")} ${number(row.evidence.level)}%</small></details>` : ""}</td>
          </tr>`).join("")}</tbody>
        </table>
      </div>
      <p class="field-note">${escapeHtml(result.disclaimer)}</p>
    </section>`;
}

function translationPanel(workspace) {
  return `<div class="pro-grid pro-grid--split">
    <section class="tool-card">
      <span class="section-kicker">${L("Source-preserving translation", "ترجمة تحفظ المصدر")}</span>
      <h3>${L("Academic terminology aid", "مساعدة المصطلحات الأكاديمية")}</h3>
      <p class="tool-sub">${L("Translate common syllabus and transcript terms between English and Arabic while retaining the original text side by side.", "ترجم مصطلحات السيلابس والترانسكريبت الشائعة بين العربية والإنجليزية مع إبقاء النص الأصلي بجانبها.")}</p>
      <label class="field"><span>${L("Target language", "اللغة المستهدفة")}</span><select id="translationLanguage"><option value="ar">العربية</option><option value="en">English</option></select></label>
        <label class="field"><span>${L("Document file", "ملف المستند")}</span><input id="translationFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.md,application/pdf,image/*,text/plain"><small>${L("Scanned pages are read locally with OCR before translation.", "تُقرأ الصفحات المصورة محليًا باستخدام OCR قبل الترجمة.")}</small></label>
      <label class="field"><span>${L("Document text", "نص المستند")}</span><textarea id="translationText" rows="12" maxlength="60000" placeholder="${L("Paste transcript or syllabus text here.", "الصق نص الترانسكريبت أو السيلابس هنا.")}"></textarea></label>
      <div class="row-actions"><button class="btn btn--primary" type="button" id="runTranslation">${L("Translate academic terms", "ترجمة المصطلحات الأكاديمية")}</button></div>
      <div id="translationStatus" class="setup-status" aria-live="polite"></div>
    </section>
    <section class="tool-card">
      <span class="section-kicker">${L("Credit systems", "أنظمة الساعات")}</span>
      <h3>${L("ECTS, UK CATS, and US semester credits", "ECTS وUK CATS والساعات الفصلية الأمريكية")}</h3>
      <p class="tool-sub">${L("Exact only where documented practice supports it. US comparisons are shown as a range.", "تكون النتيجة دقيقة فقط عندما يدعمها مصدر موثق، وتظهر المقارنات الأمريكية كنطاق.")}</p>
      <div class="field-grid">
        <label class="field"><span>${L("Credits", "الساعات")}</span><input id="creditAmount" type="number" min="0" max="2000" step="0.5" value="30"></label>
        <label class="field"><span>${L("From", "من")}</span><select id="creditSource"><option value="ECTS">ECTS</option><option value="UK_CATS">UK CATS</option><option value="US_SEMESTER">US semester</option></select></label>
        <label class="field"><span>${L("To", "إلى")}</span><select id="creditTarget"><option value="UK_CATS">UK CATS</option><option value="ECTS">ECTS</option><option value="US_SEMESTER">US semester</option></select></label>
      </div>
      <div class="row-actions"><button class="btn btn--ghost" type="button" id="runCreditConversion">${L("Convert with evidence", "التحويل مع الدليل")}</button></div>
      <div id="creditStatus" class="setup-status" aria-live="polite"></div>
      <div id="creditResults">${workspace.creditConversion ? renderCreditConversion(workspace.creditConversion) : ""}</div>
    </section>
  </div>
  <div id="translationResults">${workspace.translation ? renderTranslation(workspace.translation) : `<div class="pro-empty"><strong>${L("No translated terminology yet.", "لا توجد مصطلحات مترجمة بعد.")}</strong><span>${L("This terminology aid is not a certified document translation.", "مساعدة المصطلحات هذه ليست ترجمة مستند معتمدة.")}</span></div>`}</div>`;
}

function renderTranslation(result) {
  return `<section class="tool-card tool-card--wide">
    <header class="pro-card-head"><div><span class="section-kicker">${L("Translation aid", "مساعدة الترجمة")} · ${escapeHtml(result.targetLanguage)}</span><h3>${number(result.matchedAcademicTerms)} ${L("academic term matches", "مصطلحًا أكاديميًا مطابقًا")}</h3><p>${escapeHtml(result.statement)}</p></div></header>
    <div class="pro-translation-compare">
      <div><span>${L("Original", "الأصل")}</span><pre>${escapeHtml(result.originalText)}</pre></div>
      <div><span>${L("Terminology-aided text", "النص بمساعدة المصطلحات")}</span><pre>${escapeHtml(result.translatedText)}</pre></div>
    </div>
    <details><summary>${L("Applied glossary", "المصطلحات المطبقة")}</summary><div class="pro-glossary">${(result.glossary || []).map((item) => `<span><strong>${escapeHtml(item.source)}</strong>${escapeHtml(item.translated)}</span>`).join("")}</div></details>
  </section>`;
}

function renderCreditConversion(result) {
  const range = result.range || [0, 0];
  return `<div class="pro-credit-result">
    <strong>${result.exact ? number(range[0]).toFixed(2) : `${number(range[0]).toFixed(2)}–${number(range[1]).toFixed(2)}`}</strong>
    <span>${escapeHtml(result.targetSystem)}</span>
    <p>${escapeHtml(result.basis)}</p>
    <div>${(result.sources || []).map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${escapeHtml(source.label)}</a>`).join("")}</div>
  </div>`;
}

function institutionPanel(keys) {
  return `<div class="pro-grid pro-grid--split">
    <section class="tool-card">
      <span class="section-kicker">Institutional beta</span>
      <h3>Bulk academic analysis</h3>
      <p class="tool-sub">Process 1–100 JSON records with exact success and failure counts. Results never silently drop rows.</p>
      <label class="field"><span>Action</span><select id="institutionAction">
        <option value="academic_twin">Academic Twin</option>
        <option value="academic_undo">Academic Undo</option>
        <option value="credit_conversion">Credit conversion</option>
        <option value="transfer">Transfer matching</option>
        <option value="integrity">Consistency review</option>
      </select></label>
      <label class="field"><span>JSON array</span><textarea id="institutionRecords" rows="12" spellcheck="false">[
  {
    "currentGpa": 3.1,
    "completedCredits": 60,
    "remainingCredits": 60,
    "targetGpa": 3.5,
    "maxGpa": 4,
    "termsRemaining": 4
  }
]</textarea></label>
      <div class="row-actions"><button class="btn btn--primary" id="runInstitutionBatch" type="button">Run bulk job</button></div>
      <div id="institutionBatchStatus" class="setup-status" aria-live="polite"></div>
      <div id="institutionBatchResults"></div>
    </section>
    <section class="tool-card">
      <span class="section-kicker">API access</span>
      <h3>Server-to-server integration</h3>
      <p class="tool-sub">Create a revocable key. The full token is shown once; only its cryptographic hash is stored.</p>
      <label class="field"><span>Key name</span><input id="institutionKeyName" maxlength="80" value="Student success integration"></label>
      <div class="row-actions"><button class="btn btn--ghost" id="createInstitutionKey" type="button">Create API key</button></div>
      <div id="institutionKeyStatus" class="setup-status" aria-live="polite"></div>
      <div id="institutionKeys" class="pro-api-key-list">${renderInstitutionKeys(keys)}</div>
      <details class="pro-api-example"><summary>API example</summary><pre>POST https://instantgpa.com/api/v1/institution/bulk
Authorization: Bearer igpa_live_••••
Content-Type: application/json

{
  "action": "credit_conversion",
  "records": [
    { "credits": 30, "sourceSystem": "ECTS", "targetSystem": "UK_CATS" }
  ]
}</pre><p>Beta limits: 100 records per request and 5,000 successful or failed input records per subscription month.</p></details>
    </section>
  </div>`;
}

function renderInstitutionKeys(keys) {
  return (keys || []).map((key) => `<article class="${key.active ? "" : "is-revoked"}">
    <div><strong>${escapeHtml(key.name)}</strong><span>${escapeHtml(key.prefix)}… · ${escapeHtml(key.scopes)}</span><small>${key.lastUsedAt ? `Last used ${new Date(key.lastUsedAt).toLocaleString()}` : "Never used"}</small></div>
    ${key.active ? `<button class="btn btn--text" type="button" data-revoke-institution-key="${escapeHtml(key.id)}">Revoke</button>` : "<span>Revoked</span>"}
  </article>`).join("") || '<div class="pro-empty"><strong>No institutional API key.</strong><span>Create one only for a trusted server integration; never place it in browser code.</span></div>';
}

function renderInstitutionBatch(batch) {
  return `<section class="pro-batch-result">
    <div class="pro-inline-metrics">
      <span><strong>${number(batch.recordCount)}</strong> inputs</span>
      <span><strong>${number(batch.successCount)}</strong> successful</span>
      <span><strong>${number(batch.failedCount)}</strong> failed</span>
    </div>
    <details><summary>Reviewed result rows</summary><pre>${escapeHtml(JSON.stringify(batch.results || [], null, 2))}</pre></details>
  </section>`;
}

function integrityPanel(workspace) {
  const fingerprint = Storage.get("transcriptFingerprint:v1", null);
  return `
    <div class="pro-grid pro-grid--split">
      <section class="tool-card">
        <span class="section-kicker">${L("04 · Review readiness", "04 · جاهزية المراجعة")}</span>
        <h3>${L("Check document consistency", "فحص اتساق المستند")}</h3>
        <p class="tool-sub">${L("InstantGPA checks the SHA-256 fingerprint saved during transcript import and the approved course rows. Re-upload is optional.", "يفحص InstantGPA بصمة SHA-256 المحفوظة عند رفع الترانسكريبت وصفوف المواد المعتمدة. إعادة الرفع اختيارية.")}</p>
        ${fingerprint?.sha256 ? `<p class="record-connected">● ${L("The imported transcript fingerprint is ready; no second upload is required.", "بصمة الترانسكريبت جاهزة ولا يلزم رفعه مرة أخرى.")}</p>` : ""}
        <label class="field"><span>${L("Transcript file", "ملف الترانسكريبت")}</span><input id="integrityFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,application/pdf,image/*"></label>
        <div class="row-actions"><button class="btn btn--primary" type="button" id="runIntegrity">${L("Run consistency review", "تشغيل مراجعة الاتساق")}</button></div>
        <div id="integrityStatus" class="setup-status" aria-live="polite"></div>
      </section>
      <section class="tool-card pro-value-card">
        <span class="section-kicker">${L("Responsible use", "استخدام مسؤول")}</span>
        <h3>${L("Not a fraud verdict", "ليس حكمًا بالاحتيال")}</h3>
        <p>${L("The score measures review readiness and consistency signals. Never use it alone to accuse a student or authenticate an official document.", "تقيس النتيجة جاهزية المراجعة وإشارات الاتساق، ولا يجوز استخدامها وحدها لاتهام طالب أو اعتماد مستند رسمي.")}</p>
      </section>
    </div>
    <div id="integrityResults">${workspace.integrity ? renderIntegrity(workspace.integrity) : `<div class="pro-empty"><strong>${L("No consistency review yet.", "لا توجد مراجعة اتساق بعد.")}</strong><span>${L("Approve transcript rows first for a more useful result.", "اعتمد صفوف الترانسكريبت أولًا لنتيجة أكثر فائدة.")}</span></div>`}</div>`;
}

function renderIntegrity(result) {
  return `
    <section class="tool-card tool-card--wide pro-integrity-result">
      <div class="pro-integrity-score"><strong>${number(result.score)}</strong><span>${L("review readiness", "جاهزية المراجعة")}</span></div>
      <div>
        <span class="section-kicker">${escapeHtml(String(result.tier || "").replaceAll("_", " "))}</span>
        <h3>${result.issues?.length ? L("Signals that need human review", "إشارات تحتاج مراجعة بشرية") : L("No material consistency signal detected", "لم تُكتشف إشارة اتساق جوهرية")}</h3>
        <ul class="pro-signal-list">${(result.issues || []).map((issue) => `<li class="is-${escapeHtml(issue.level)}"><strong>${escapeHtml(issue.label)}</strong><span>${escapeHtml(issue.detail)}</span></li>`).join("") || `<li><strong>${L("Structured record available", "السجل المنظم متاح")}</strong><span>${L("No listed consistency check was triggered.", "لم يُفعّل أي فحص اتساق مدرج.")}</span></li>`}</ul>
        <p class="field-note">${escapeHtml(result.statement)}</p>
      </div>
    </section>`;
}

function advisorPanel(workspace) {
  const profile = AcademicProfile.get() || {};
  const courses = AcademicState.mergedCourses();
  return `
    <div class="pro-grid pro-grid--split">
      <section class="tool-card">
        <span class="section-kicker">${L("05 · Adviser handoff", "05 · التسليم للمرشد")}</span>
        <h3>${L("Create a review link", "إنشاء رابط مراجعة")}</h3>
        <p class="tool-sub">${L("Create a time-limited link for results and the latest Academic Twin summary.", "أنشئ رابطًا محدد المدة للنتائج وآخر ملخص Academic Twin.")}</p>
        <div class="field-grid">
          <label class="field field--wide"><span>${L("Review title", "عنوان المراجعة")}</span><input id="advisorTitle" maxlength="120" value="${escapeHtml(`${profile.university || "InstantGPA"} ${L("academic plan review", "مراجعة الخطة الأكاديمية")}`)}"></label>
          <label class="field"><span>${L("Expires after", "ينتهي بعد")}</span><select id="advisorExpiry"><option value="1">${L("1 day", "يوم")}</option><option value="7" selected>${L("7 days", "7 أيام")}</option><option value="30">${L("30 days", "30 يومًا")}</option><option value="90">${L("90 days", "90 يومًا")}</option></select></label>
          <label class="field"><span>${L("Optional password", "كلمة مرور اختيارية")}</span><input id="advisorPassword" type="password" minlength="6" maxlength="72" autocomplete="new-password" placeholder="${L("At least 6 characters", "6 أحرف على الأقل")}"></label>
        </div>
        <div class="row-actions"><button class="btn btn--primary" type="button" id="createAdvisorLink">${L("Create adviser link", "إنشاء رابط المرشد")}</button></div>
        <div id="advisorStatus" class="setup-status" aria-live="polite"></div>
      </section>
      <section class="tool-card pro-value-card">
        <span class="section-kicker">${L("Controlled sharing", "مشاركة محكومة")}</span>
        <h3>${L("Read-only, limited, and revocable", "قراءة فقط ومحددة وقابلة للإلغاء")}</h3>
        <p>${L("Links are time-limited, optionally password protected, and revocable from the report or account.", "الروابط محددة المدة ويمكن حمايتها بكلمة مرور وإلغاؤها من التقرير أو الحساب.")}</p>
      </section>
    </div>
    <section class="tool-card tool-card--wide">
      <span class="section-kicker">${L("Adviser decisions and exceptions", "قرارات المرشد والاستثناءات")}</span><h3>${L("Record a decision after it is issued officially", "سجّل القرار بعد صدوره رسميًا")}</h3>
      <p class="tool-sub">${L("This is an evidence log, not an approval tool. Add the official reference so the exception is never confused with an InstantGPA recommendation.", "هذا سجل أدلة وليس أداة موافقة. أضف المرجع الرسمي حتى لا يختلط الاستثناء مع اقتراح من InstantGPA.")}</p>
      <div class="field-grid"><label class="field"><span>${L("Course", "المادة")}</span><select id="advisorDecisionCourse"><option value="">${L("Programme-wide decision", "قرار على مستوى البرنامج")}</option>${courses.map((course) => `<option value="${escapeHtml(course.attemptId || course.id)}">${escapeHtml([course.code, course.name].filter(Boolean).join(" · "))}</option>`).join("")}</select></label><label class="field"><span>${L("Decision", "القرار")}</span><select id="advisorDecisionType"><option value="approved">${L("Approved", "موافقة")}</option><option value="rejected">${L("Rejected", "رفض")}</option><option value="exception">${L("Exception granted", "منح استثناء")}</option><option value="pending">${L("Pending", "قيد المراجعة")}</option></select></label></div>
      <label class="field"><span>${L("Official reference URL or case number", "رابط المرجع الرسمي أو رقم الطلب")}</span><input id="advisorDecisionReference" maxlength="300"></label><label class="field"><span>${L("Short note", "ملاحظة قصيرة")}</span><textarea id="advisorDecisionNote" rows="3" maxlength="500"></textarea></label>
      <button id="saveAdvisorDecision" class="btn btn--primary" type="button">${L("Save evidence log", "حفظ سجل الدليل")}</button><div id="advisorDecisionStatus" class="setup-status" aria-live="polite"></div>
      <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>${L("Course", "المادة")}</th><th>${L("Decision", "القرار")}</th><th>${L("Reference", "المرجع")}</th><th>${L("Recorded", "تاريخ التسجيل")}</th></tr></thead><tbody>${(workspace.advisorDecisions || []).map((decision) => `<tr><td>${escapeHtml(decision.courseLabel || L("Programme", "البرنامج"))}</td><td>${escapeHtml(decision.type)}</td><td>${/^https:\/\//i.test(decision.reference || "") ? `<a href="${escapeHtml(decision.reference)}" target="_blank" rel="noopener">${L("Open", "فتح")}</a>` : escapeHtml(decision.reference || "—")}</td><td>${new Date(decision.recordedAt).toLocaleDateString(locale())}</td></tr>`).join("") || `<tr><td colspan="4">${L("No adviser decision recorded.", "لم يُسجل قرار مرشد.")}</td></tr>`}</tbody></table></div>
    </section>
    <section id="advisorLinks" class="pro-stack">
      ${renderAdvisorLinks(workspace)}
    </section>`;
}

function renderAdvisorLinks(workspace) {
  return workspace.advisorLinks?.length
    ? workspace.advisorLinks.map((link) => `<article class="tool-card pro-advisor-link"><div><strong>${escapeHtml(link.title)}</strong><span>${L("Expires", "ينتهي")} ${new Date(link.expiresAt).toLocaleString(locale())}</span></div><a class="btn btn--ghost" href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${L("Open link", "فتح الرابط")}</a></article>`).join("")
    : `<div class="pro-empty"><strong>${L("No adviser link created in this workspace.", "لم يُنشأ رابط مرشد في هذه المساحة.")}</strong><span>${L("Create one after generating the Academic Twin plan you want reviewed.", "أنشئ رابطًا بعد إعداد خطة Academic Twin التي تريد مراجعتها.")}</span></div>`;
}

function advisorPayload(workspace) {
  const profile = AcademicProfile.get() || {};
  const system = GradingEngine.getActive() || { label: "Not configured", maxGpa: 4 };
  const summary = AcademicState.cumulativeSummary(system);
  return {
    reportType: "InstantGPA Pro Adviser Review",
    createdAt: new Date().toISOString(),
    disclaimer: "Planning report only. The institution remains authoritative.",
    profile: {
      country: profile.countryName || "",
      university: profile.university || "",
      college: profile.college || "",
      program: profile.program || "",
    },
    gradingSystem: {
      label: system.label,
      maximumGpa: system.maxGpa || 4,
      retakePolicy: system.retakePolicy || "all",
    },
    summary: {
      gpa: summary.gpa,
      maximumGpa: summary.maxGpa,
      gpaCredits: summary.gpaCredits,
      earnedCredits: summary.earnedCredits,
      registeredCredits: summary.registeredCredits,
      issues: summary.issues,
    },
    courses: summary.courses.map((course) => ({
      term: course.term,
      code: course.code,
      name: course.name,
      credits: course.credits,
      grade: course.grade,
      includedInGpa: Boolean(course.includeInGpa),
    })),
    academicTwin: workspace.twin,
    academicUndo: workspace.undo,
    syllabusTargets: (workspace.syllabi || []).map((syllabus) => ({
      courseName: syllabus.courseName,
      targetScore: syllabus.targetScore,
      assessments: syllabus.assessments,
    })),
    transferReview: workspace.transfer,
    creditConversion: workspace.creditConversion,
    academicTranslation: workspace.translation ? {
      targetLanguage: workspace.translation.targetLanguage,
      matchedAcademicTerms: workspace.translation.matchedAcademicTerms,
      statement: workspace.translation.statement,
    } : null,
    integrityReview: workspace.integrity,
    adviserDecisions: workspace.advisorDecisions,
    evidence: {
      methodology: "https://instantgpa.com/trust",
      editorialPolicy: "https://instantgpa.com/editorial-policy",
      originalTranscriptIncluded: false,
      originalSyllabusIncluded: false,
    },
  };
}

function icsDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsText(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function calendarDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function mount(container) {
  container.innerHTML = '<div class="tool-card tool-card--loading" aria-busy="true">Checking subscriber access…</div>';
  const sessionResult = await CloudSync.getSession();
  if (!sessionResult.ok || !sessionResult.session) {
    container.innerHTML = paywall("signed_out");
    return;
  }
  const statusResult = await CloudSync.getAccountStatus();
  if (!statusResult.ok || !activeEntitlement(statusResult.data)) {
    container.innerHTML = paywall(
      statusResult.data?.premiumMode === "owner_only" || statusResult.reason === "PREMIUM_OWNER_ONLY"
        ? "owner_only"
        : statusResult.reason || "subscription",
    );
    return;
  }
  const loaded = await CloudSync.loadProWorkspace();
  if (!loaded.ok) {
    container.innerHTML = loaded.reason === "SUBSCRIPTION_REQUIRED"
      ? paywall("subscription")
      : '<section class="tool-card"><h2>Pro workspace unavailable</h2><p>Refresh and try again. Your local academic record was not changed.</p></section>';
    return;
  }

  let version = loaded.data.version || 0;
  const workspace = emptyWorkspace(loaded.data.workspace);
  const institutionAccess = Boolean(statusResult.data.isOwner || /institution/i.test(statusResult.data.entitlement?.plan || ""));
  Storage.set("premiumSyllabi:v1", workspace.syllabi);
  const profile = AcademicProfile.get() || {};
  const [policyResult, keyResult, catalogResult] = await Promise.all([
    CloudSync.getProPolicies(),
    institutionAccess ? CloudSync.listInstitutionKeys() : Promise.resolve({ ok: true, data: { keys: [] } }),
    CloudSync.getApprovedCatalog({ institution: profile.university, countryCode: profile.countryCode, college: profile.college, department: profile.department, program: profile.department, catalogYear: workspace.catalogYear || "" }),
  ]);
  let policyData = policyResult.ok ? policyResult.data : { entries: [], sources: [] };
  const catalogData = catalogResult.ok ? catalogResult.data : { verified: false, sources: [], facts: [] };
  let institutionKeys = keyResult.ok ? keyResult.data.keys || [] : [];
  container.innerHTML = proShell(statusResult.data.entitlement, institutionAccess, workspace);
  renderPanels();
  wireTabs();
  wireCurrentPanels();
  const requestedTab = new URLSearchParams(location.search).get("tab");
  if (requestedTab && container.querySelector(`#proPanel-${requestedTab}`)) activatePanel(requestedTab, { focus: false });

  function renderPanels() {
    container.querySelector("#proPanel-semester").innerHTML = semesterPanel(workspace);
    container.querySelector("#proPanel-syllabus").innerHTML = syllabusPanel(workspace);
    container.querySelector("#proPanel-integrations").innerHTML = integrationsPanel(workspace);
    container.querySelector("#proPanel-plan").innerHTML = nextTermPanel(workspace, catalogData);
    container.querySelector("#proPanel-twin").innerHTML = twinPanel(workspace);
    container.querySelector("#proPanel-undo").innerHTML = undoPanel(workspace, policyData);
    container.querySelector("#proPanel-policies").innerHTML = policiesPanel(policyData, catalogData);
    container.querySelector("#proPanel-transfer").innerHTML = transferPanel(workspace);
    container.querySelector("#proPanel-translation").innerHTML = translationPanel(workspace);
    container.querySelector("#proPanel-integrity").innerHTML = integrityPanel(workspace);
    if (institutionAccess) container.querySelector("#proPanel-institution").innerHTML = institutionPanel(institutionKeys);
    container.querySelector("#proPanel-advisor").innerHTML = advisorPanel(workspace);
  }

  function activatePanel(id, { focus = true } = {}) {
    if (!container.querySelector(`#proPanel-${id}`)) return;
    container.querySelectorAll(".pro-panel").forEach((panel) => { panel.hidden = panel.id !== `proPanel-${id}`; });
    const select = container.querySelector("#proToolSelect");
    if (select) select.value = id;
    const url = new URL(location.href);
    url.searchParams.set("tab", id);
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
    if (focus) select?.focus();
  }

  function wireTabs() {
    container.querySelector("#proToolSelect")?.addEventListener("change", (event) => activatePanel(event.target.value, { focus: false }));
    container.querySelectorAll("[data-pro-open]").forEach((button) => button.addEventListener("click", () => activatePanel(button.dataset.proOpen)));
  }

  async function saveWorkspace(message = L("Pro workspace saved.", "تم حفظ مساحة Pro.")) {
    const status = container.querySelector("#proGlobalStatus");
    status.innerHTML = statusLine("Saving…", "جارٍ الحفظ…");
    const result = await CloudSync.saveProWorkspace(workspace, version);
    if (!result.ok) {
      status.innerHTML = statusLine(localizedError(result.error, "The Pro workspace could not be saved.", "تعذر حفظ مساحة Pro."), localizedError(result.error, "The Pro workspace could not be saved.", "تعذر حفظ مساحة Pro."), true);
      return false;
    }
    version = result.data.version;
    Storage.set("premiumSyllabi:v1", workspace.syllabi || []);
    status.innerHTML = `<p class="setup-status__text">${escapeHtml(message)}</p>`;
    return true;
  }

  function wireCurrentPanels() {
    wireIntegrationsPanel(container, workspace, saveWorkspace, () => {
      renderPanels();
      wireCurrentPanels();
      activatePanel("integrations", { focus: false });
    });
    container.querySelector("#buildNextTermPlan")?.addEventListener("click", async () => {
      const status = container.querySelector("#nextTermPlanStatus");
      const offeredCourseCodes = container.querySelector("#offeredCourseCodes").value.split(/[\s,;]+/).map((code) => code.trim()).filter(Boolean);
      if (!offeredCourseCodes.length) {
        status.innerHTML = statusLine("Paste the official offered course codes first.", "الصق أكواد المواد المطروحة رسميًا أولًا.", true);
        return;
      }
      status.innerHTML = statusLine("Checking completion, prerequisites, catalog citations, and credit load…", "جارٍ فحص الإنجاز والمتطلبات ومراجع الكتالوج والعبء الدراسي…");
      const result = await CloudSync.runProAnalysis("next_term_plan", {
        courses: AcademicState.mergedCourses(), catalogFacts: catalogData.facts,
        offeredCourseCodes, maxCredits: number(container.querySelector("#nextTermMaxCredits").value, 18),
      });
      if (!result.ok) { status.innerHTML = statusLine("The plan could not be built.", "تعذر إنشاء الخطة.", true); return; }
      workspace.offeredCourseCodes = offeredCourseCodes;
      workspace.nextTermPlan = result.data.result;
      await saveWorkspace(L("Next-term plan saved.", "تم حفظ خطة الفصل القادم."));
      renderPanels(); wireCurrentPanels(); activatePanel("plan", { focus: false });
    });
    container.querySelector("#askOfficialPolicy")?.addEventListener("click", async () => {
      const question = container.querySelector("#officialPolicyQuestion").value.trim();
      const status = container.querySelector("#officialPolicyAnswer");
      if (question.length < 3) { status.innerHTML = statusLine("Enter a clear policy question.", "اكتب سؤالًا واضحًا عن اللائحة.", true); return; }
      status.innerHTML = statusLine("Searching only approved official evidence…", "جارٍ البحث داخل الأدلة الرسمية المعتمدة فقط…");
      const result = await CloudSync.runProAnalysis("policy_question", { question, facts: catalogData.facts, sources: catalogData.sources });
      if (!result.ok) { status.innerHTML = statusLine("The approved sources could not be searched.", "تعذر البحث في المصادر المعتمدة.", true); return; }
      const answer = result.data.result;
      status.innerHTML = `<article class="pro-evidence-box"><strong>${escapeHtml(answer.verified ? answer.answer : L("Uncertain", "غير مؤكد"))}</strong>${(answer.citations || []).map((citation) => `<p>${escapeHtml(citation.summary)}<br><a href="${escapeHtml(citation.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(citation.sourceTitle)}</a> · ${L("page", "صفحة")} ${number(citation.page)} · ${number(citation.score)}%</p>`).join("") || `<span>${escapeHtml(answer.answer)}</span>`}<small>${escapeHtml(answer.limitation || L("No official support found.", "لم يوجد دعم رسمي."))}</small></article>`;
    });
    container.querySelectorAll("[data-open-syllabus]").forEach((button) => button.addEventListener("click", () => {
      activatePanel("syllabus", { focus: false });
      const card = container.querySelector(`[data-syllabus-index="${button.dataset.openSyllabus}"]`);
      card?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));

    const syncUndoCourse = () => {
      const courses = AcademicState.mergedCourses();
      const selected = courses.find((course) => course.attemptId === container.querySelector("#undoCourse")?.value);
      const credits = Math.max(0, number(selected?.credits, 0));
      const affected = downstreamCourses(selected, courses).map((course) => course.code || course.name).filter(Boolean);
      const settings = Storage.get("commandCenterSettings:v1", {}) || {};
      if (container.querySelector("#undoAdditionalCredits")) container.querySelector("#undoAdditionalCredits").value = String(credits);
      if (container.querySelector("#undoCost")) container.querySelector("#undoCost").value = String(number(settings.costPerCredit, 0) * credits);
      if (container.querySelector("#undoPrerequisites")) container.querySelector("#undoPrerequisites").value = affected.join("\n");
    };
    container.querySelector("#undoCourse")?.addEventListener("change", syncUndoCourse);
    container.querySelector("#undoDecision")?.addEventListener("change", (event) => {
      const decision = event.target.value;
      const selected = AcademicState.mergedCourses().find((course) => course.attemptId === container.querySelector("#undoCourse")?.value);
      const credits = Math.max(0, number(selected?.credits, 0));
      const costPerCredit = number((Storage.get("commandCenterSettings:v1", {}) || {}).costPerCredit, 0);
      const isRetake = decision === "Retake a course";
      const addsDelay = ["Reduce semester load", "Transfer university", "Change major"].includes(decision);
      if (container.querySelector("#undoAdditionalCredits")) container.querySelector("#undoAdditionalCredits").value = String(isRetake ? credits : 0);
      if (container.querySelector("#undoDelay")) container.querySelector("#undoDelay").value = String(addsDelay ? 1 : 0);
      if (container.querySelector("#undoCost")) container.querySelector("#undoCost").value = String(isRetake ? costPerCredit * credits : 0);
    });

    container.querySelector("#enableProReminders")?.addEventListener("click", async () => {
      const status = container.querySelector("#proReminderStatus");
      if (!window.InstantGPAPWA?.enableReminders) {
        status.innerHTML = statusLine("Deadline reminders are not supported by this browser.", "هذا المتصفح لا يدعم تذكيرات المواعيد.", true);
        return;
      }
      status.innerHTML = statusLine("Requesting notification permission…", "جارٍ طلب إذن الإشعارات…");
      const result = await window.InstantGPAPWA.enableReminders(allAssessments(workspace), true);
      status.innerHTML = result.ok
        ? statusLine(
          `${number(result.dueCount)} upcoming assessment reminder${number(result.dueCount) === 1 ? "" : "s"} synchronized.${result.background ? " Background checks are available on this device." : " Reminders are refreshed when you open InstantGPA."}`,
          `تمت مزامنة ${number(result.dueCount)} من تذكيرات التقييمات القادمة.${result.background ? " تتوفر مراجعة في الخلفية على هذا الجهاز." : " تتجدد التذكيرات عند فتح InstantGPA."}`,
        )
        : statusLine("Reminders were not enabled. You can still export the calendar.", "لم تُفعّل التذكيرات، وما زال بإمكانك تصدير التقويم.", true);
    });

    container.querySelector("#installInstantGpa")?.addEventListener("click", async () => {
      const status = container.querySelector("#proReminderStatus");
      const result = await window.InstantGPAPWA?.install?.();
      status.innerHTML = result?.ok
        ? statusLine("InstantGPA was added to this device.", "تمت إضافة InstantGPA إلى هذا الجهاز.")
        : statusLine("Use your browser menu and choose “Install app” or “Add to Home Screen” if the install prompt is not shown here.", "استخدم قائمة المتصفح واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية» إذا لم يظهر طلب التثبيت هنا.");
    });

    container.querySelector("#askSyllabus")?.addEventListener("click", async () => {
      const index = number(container.querySelector("#proChatSyllabus").value, -1);
      const question = container.querySelector("#proChatQuestion").value.trim();
      const status = container.querySelector("#proChatStatus");
      const syllabus = workspace.syllabi[index];
      if (!syllabus || question.length < 3) {
        status.innerHTML = statusLine("Choose a syllabus and enter a clear question.", "اختر سيلابس وأدخل سؤالًا واضحًا.", true);
        return;
      }
      status.innerHTML = statusLine("Searching saved syllabus evidence…", "جارٍ البحث في أدلة السيلابس المحفوظة…");
      const result = await CloudSync.runProAnalysis("syllabus_chat", { question, syllabus });
      if (!result.ok) {
        const message = localizedError(result.error, "The syllabus question could not be answered.", "تعذر الإجابة عن سؤال السيلابس.");
        status.innerHTML = statusLine(message, message, true);
        return;
      }
      workspace.syllabusChats.unshift({
        id: crypto.randomUUID(),
        syllabusId: syllabus.id,
        courseName: syllabus.courseName,
        question,
        ...result.data.result,
        createdAt: new Date().toISOString(),
      });
      workspace.syllabusChats = workspace.syllabusChats.slice(0, 30);
      await saveWorkspace(L("Syllabus answer saved with citations.", "تم حفظ إجابة السيلابس مع مراجعها."));
      container.querySelector("#proChatHistory").innerHTML = workspace.syllabusChats.slice(0, 8).map(renderChatMessage).join("");
      container.querySelector("#proChatQuestion").value = "";
      status.innerHTML = statusLine("Answer grounded in saved lines. Open the cited source before acting.", "الإجابة مبنية على السطور المحفوظة. افتح المصدر المشار إليه قبل اتخاذ قرار.");
    });

    container.querySelector("#runAcademicUndo")?.addEventListener("click", async () => {
      const button = container.querySelector("#runAcademicUndo");
      const status = container.querySelector("#undoStatus");
      const selectedPolicy = policyData.entries.find((entry) => entry.id === container.querySelector("#undoPolicy").value);
      const selectedCourse = AcademicState.mergedCourses().find((course) => course.attemptId === container.querySelector("#undoCourse")?.value);
      const decision = container.querySelector("#undoDecision").value;
      const system = GradingEngine.getActive() || { maxGpa: 4 };
      button.disabled = true;
      status.innerHTML = statusLine("Running 5,000 before-and-after scenarios…", "جارٍ تشغيل 5000 سيناريو قبل القرار وبعده…");
      const result = await CloudSync.runProAnalysis("academic_undo", {
        decision: selectedCourse ? `${decision} — ${[selectedCourse.code, selectedCourse.name].filter(Boolean).join(" — ")}` : decision,
        currentGpa: number(container.querySelector("#undoCurrentGpa").value),
        completedCredits: number(container.querySelector("#undoCompletedCredits").value),
        remainingCredits: number(container.querySelector("#undoRemainingCredits").value),
        targetGpa: number(container.querySelector("#undoTargetGpa").value),
        expectedAverage: number(container.querySelector("#undoBeforeAverage").value),
        afterExpectedAverage: number(container.querySelector("#undoAfterAverage").value),
        uncertainty: number(container.querySelector("#undoBeforeUncertainty").value),
        afterUncertainty: number(container.querySelector("#undoAfterUncertainty").value),
        scholarshipGpa: number(container.querySelector("#undoScholarship").value),
        additionalCredits: number(container.querySelector("#undoAdditionalCredits").value),
        delayTerms: number(container.querySelector("#undoDelay").value),
        extraCost: number(container.querySelector("#undoCost").value),
        deadline: container.querySelector("#undoDeadline").value,
        affectedPrerequisites: container.querySelector("#undoPrerequisites").value,
        maxGpa: system.maxGpa || 4,
        policyName: selectedPolicy?.institution || "",
        policySource: selectedPolicy?.policyUrl || "",
        policyEffectiveDate: selectedPolicy?.reviewedAt || "",
      });
      button.disabled = false;
      if (!result.ok) {
        const message = localizedError(result.error, "The decision simulation failed.", "فشلت محاكاة القرار.");
        status.innerHTML = statusLine(message, message, true);
        return;
      }
      workspace.undo = { ...result.data.result, generatedAt: new Date().toISOString() };
      await saveWorkspace(L("Academic Undo scenario saved.", "تم حفظ سيناريو Academic Undo."));
      container.querySelector("#undoResults").innerHTML = renderUndo(workspace.undo);
      status.innerHTML = statusLine("Simulation complete. Review the assumptions and official source before acting.", "اكتملت المحاكاة. راجع الافتراضات والمصدر الرسمي قبل اتخاذ القرار.");
    });

    container.querySelector("#runPolicySearch")?.addEventListener("click", async () => {
      const status = container.querySelector("#policyStatus");
      const query = container.querySelector("#policySearch").value.trim();
      status.innerHTML = statusLine("Searching the subscriber registry…", "جارٍ البحث في سجل السياسات الرسمي…");
      const result = await CloudSync.getProPolicies(query);
      if (!result.ok) {
        const message = localizedError(result.error, "Policy search failed.", "فشل البحث عن السياسة.");
        status.innerHTML = statusLine(message, message, true);
        return;
      }
      container.querySelector("#policyCatalog").innerHTML = renderPolicies(result.data.entries || []);
      status.innerHTML = statusLine(
        `${number(result.data.entries?.length)} official-source institution${number(result.data.entries?.length) === 1 ? "" : "s"} matched.`,
        `تم العثور على ${number(result.data.entries?.length)} مؤسسة بمصدر رسمي.`,
      );
    });

    const parseButton = container.querySelector("#proParseSyllabus");
    parseButton?.addEventListener("click", async () => {
      const file = container.querySelector("#proSyllabusFile").files[0];
      const courseName = container.querySelector("#proSyllabusCourse").value.trim();
      const targetScore = number(container.querySelector("#proSyllabusTarget").value, 85);
      const status = container.querySelector("#proSyllabusStatus");
      if (!file || !courseName) {
        status.innerHTML = statusLine("Add the course name and choose a syllabus file.", "أدخل اسم المادة واختر ملف السيلابس.", true);
        return;
      }
      parseButton.disabled = true;
      try {
        const extracted = await extractAcademicDocument(file, (message) => {
          status.innerHTML = `<p class="setup-status__text">${escapeHtml(message)}</p>`;
        });
        status.innerHTML = statusLine("Structuring assessment weights and dates…", "جارٍ تنظيم أوزان التقييمات وتواريخها…");
        const result = await CloudSync.runProAnalysis("syllabus", { text: extracted.text, sourceEvidence: extracted.evidence });
        if (!result.ok) throw new Error(localizedError(result.error, "The syllabus analysis failed.", "فشل تحليل السيلابس."));
        workspace.syllabi.unshift({
          id: crypto.randomUUID(),
          courseName,
          targetScore,
          fileName: file.name,
          importedAt: new Date().toISOString(),
          ...result.data.result,
        });
        await saveWorkspace(L("Syllabus added to the Pro workspace.", "تمت إضافة السيلابس إلى مساحة Pro."));
        renderPanels();
        wireCurrentPanels();
        activatePanel("syllabus", { focus: false });
      } catch (error) {
        const message = localizedError(error.message, "The syllabus could not be read.", "تعذرت قراءة السيلابس.");
        status.innerHTML = statusLine(message, message, true);
      } finally {
        parseButton.disabled = false;
      }
    });

    container.querySelectorAll("[data-save-syllabus]").forEach((button) => button.addEventListener("click", async () => {
      const index = number(button.dataset.saveSyllabus);
      const card = container.querySelector(`[data-syllabus-index="${index}"]`);
      card.querySelectorAll("[data-syllabus-field]").forEach((input) => {
        const assessment = workspace.syllabi[index].assessments[number(input.dataset.assessmentIndex)];
        assessment[input.dataset.syllabusField] = ["weight", "score"].includes(input.dataset.syllabusField)
          ? (input.value === "" ? null : number(input.value))
          : input.value.trim();
      });
      await saveWorkspace(L("Syllabus scores updated.", "تم تحديث درجات السيلابس."));
      renderPanels();
      wireCurrentPanels();
      activatePanel("syllabus", { focus: false });
    }));

    container.querySelectorAll("[data-delete-syllabus]").forEach((button) => button.addEventListener("click", async () => {
      const index = number(button.dataset.deleteSyllabus);
      if (!window.confirm(L(
        `Delete ${workspace.syllabi[index]?.courseName || "this syllabus"} from the Pro workspace?`,
        `هل تريد حذف ${workspace.syllabi[index]?.courseName || "هذا السيلابس"} من مساحة Pro؟`,
      ))) return;
      workspace.syllabi.splice(index, 1);
      await saveWorkspace(L("Syllabus removed.", "تم حذف السيلابس."));
      renderPanels();
      wireCurrentPanels();
      activatePanel("syllabus", { focus: false });
    }));

    container.querySelectorAll("[data-export-syllabus]").forEach((button) => button.addEventListener("click", () => {
      const syllabus = workspace.syllabi[number(button.dataset.exportSyllabus)];
      const events = (syllabus.assessments || []).flatMap((assessment) => {
        const date = calendarDate(assessment.dueDate);
        if (!date) return [];
        const stamp = icsDate(date).slice(0, 8);
        return [
          "BEGIN:VEVENT",
          `UID:${assessment.id || crypto.randomUUID()}@instantgpa.com`,
          `DTSTAMP:${icsDate(new Date())}`,
          `DTSTART;VALUE=DATE:${stamp}`,
          `SUMMARY:${icsText(`${syllabus.courseName}: ${assessment.label}`)}`,
          `DESCRIPTION:${icsText(`${assessment.weight ?? "Unknown"}% of course grade · target ${syllabus.targetScore}%`)}`,
          "END:VEVENT",
        ].join("\r\n");
      });
      download(
        `${String(syllabus.courseName || "syllabus").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-assessments.ics`,
        ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//InstantGPA Pro//Syllabus Calendar//EN", ...events, "END:VCALENDAR"].join("\r\n"),
        "text/calendar;charset=utf-8",
      );
    }));

    container.querySelector("#runAcademicTwin")?.addEventListener("click", async () => {
      const button = container.querySelector("#runAcademicTwin");
      const status = container.querySelector("#twinStatus");
      const system = GradingEngine.getActive() || { maxGpa: 4 };
      button.disabled = true;
      const result = await CloudSync.runProAnalysis("academic_twin", {
        currentGpa: number(container.querySelector("#twinCurrentGpa").value),
        completedCredits: number(container.querySelector("#twinCompletedCredits").value),
        remainingCredits: number(container.querySelector("#twinRemainingCredits").value),
        targetGpa: number(container.querySelector("#twinTargetGpa").value),
        termsRemaining: number(container.querySelector("#twinTerms").value),
        costPerCredit: number(container.querySelector("#twinCost").value),
        maxGpa: system.maxGpa || 4,
      });
      button.disabled = false;
      if (!result.ok) {
        const message = localizedError(result.error, "Academic Twin analysis failed.", "فشل تحليل Academic Twin.");
        status.innerHTML = statusLine(message, message, true);
        return;
      }
      workspace.twin = { ...result.data.result, generatedAt: new Date().toISOString() };
      await saveWorkspace(L("Academic Twin plans saved.", "تم حفظ خطط Academic Twin."));
      container.querySelector("#twinResults").innerHTML = renderTwin(workspace.twin);
    });

    container.querySelector("#transferTargetFile")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const status = container.querySelector("#transferStatus");
      try {
        const extracted = await extractAcademicDocument(file, (message) => { status.innerHTML = `<p class="setup-status__text">${escapeHtml(message)}</p>`; });
        const extractedCourses = parseCourseList(extracted.text.slice(0, 60_000));
        container.querySelector("#transferTarget").value = formatCourseList(extractedCourses);
        status.innerHTML = statusLine(
          `${extractedCourses.length} catalogue course${extractedCourses.length === 1 ? "" : "s"} extracted. Review the normalized rows before comparing.`,
          `تم استخراج ${extractedCourses.length} مادة من الدليل. راجع الصفوف المنظمة قبل المقارنة.`,
        );
      } catch (error) {
        const message = localizedError(error.message, "The target catalogue could not be read.", "تعذرت قراءة دليل المواد المستهدف.");
        status.innerHTML = statusLine(message, message, true);
      }
    });

    container.querySelector("#runTransfer")?.addEventListener("click", async () => {
      const button = container.querySelector("#runTransfer");
      const status = container.querySelector("#transferStatus");
      const sourceCourses = parseCourseList(container.querySelector("#transferSource").value);
      const targetCourses = parseCourseList(container.querySelector("#transferTarget").value);
      if (!sourceCourses.length || !targetCourses.length) {
        status.innerHTML = statusLine("Add at least one source and one target course.", "أضف مادة واحدة على الأقل في المصدر والوجهة.", true);
        return;
      }
      button.disabled = true;
      const result = await CloudSync.runProAnalysis("transfer", { sourceCourses, targetCourses });
      button.disabled = false;
      if (!result.ok) {
        const message = localizedError(result.error, "Transfer analysis failed.", "فشل تحليل التحويل.");
        status.innerHTML = statusLine(message, message, true);
        return;
      }
      workspace.transfer = { ...result.data.result, generatedAt: new Date().toISOString() };
      await saveWorkspace(L("Transfer comparison saved.", "تم حفظ مقارنة التحويل."));
      container.querySelector("#transferResults").innerHTML = renderTransfer(workspace.transfer);
    });

    container.querySelector("#translationFile")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const status = container.querySelector("#translationStatus");
      try {
        const extracted = await extractAcademicDocument(file, (message) => { status.innerHTML = `<p class="setup-status__text">${escapeHtml(message)}</p>`; });
        container.querySelector("#translationText").value = extracted.text.replace(/^\[\[PAGE \d+\]\]\s*/gm, "").slice(0, 60_000);
        status.innerHTML = statusLine("Document text loaded. The source remains visible beside the terminology aid.", "تم تحميل نص المستند، وسيظل المصدر ظاهرًا بجانب مساعدة المصطلحات.");
      } catch (error) {
        const message = localizedError(error.message, "The document could not be read.", "تعذرت قراءة المستند.");
        status.innerHTML = statusLine(message, message, true);
      }
    });

    container.querySelector("#runTranslation")?.addEventListener("click", async () => {
      const button = container.querySelector("#runTranslation");
      const status = container.querySelector("#translationStatus");
      const text = container.querySelector("#translationText").value.trim();
      if (!text) {
        status.innerHTML = statusLine("Paste document text first.", "الصق نص المستند أولًا.", true);
        return;
      }
      button.disabled = true;
      const result = await CloudSync.runProAnalysis("translate_document", {
        text,
        targetLanguage: container.querySelector("#translationLanguage").value,
      });
      button.disabled = false;
      if (!result.ok) {
        const message = localizedError(result.error, "Translation aid failed.", "فشلت مساعدة الترجمة.");
        status.innerHTML = statusLine(message, message, true);
        return;
      }
      workspace.translation = { ...result.data.result, generatedAt: new Date().toISOString() };
      await saveWorkspace(L("Academic terminology result saved.", "تم حفظ نتيجة المصطلحات الأكاديمية."));
      container.querySelector("#translationResults").innerHTML = renderTranslation(workspace.translation);
      status.innerHTML = statusLine("Original and terminology-aided text are shown side by side for review.", "يظهر النص الأصلي والنص المدعوم بالمصطلحات جنبًا إلى جنب للمراجعة.");
    });

    container.querySelector("#runCreditConversion")?.addEventListener("click", async () => {
      const status = container.querySelector("#creditStatus");
      const sourceSystem = container.querySelector("#creditSource").value;
      const targetSystem = container.querySelector("#creditTarget").value;
      if (sourceSystem === targetSystem) {
        status.innerHTML = statusLine("Choose two different credit systems.", "اختر نظامي ساعات مختلفين.", true);
        return;
      }
      const result = await CloudSync.runProAnalysis("credit_conversion", {
        credits: number(container.querySelector("#creditAmount").value),
        sourceSystem,
        targetSystem,
      });
      if (!result.ok) {
        const message = localizedError(result.error, "Credit conversion failed.", "فشل تحويل الساعات.");
        status.innerHTML = statusLine(message, message, true);
        return;
      }
      workspace.creditConversion = { ...result.data.result, generatedAt: new Date().toISOString() };
      await saveWorkspace(L("Credit-system comparison saved.", "تم حفظ مقارنة أنظمة الساعات."));
      container.querySelector("#creditResults").innerHTML = renderCreditConversion(workspace.creditConversion);
      status.innerHTML = statusLine("Conversion shown with its evidence boundary.", "يظهر التحويل مع حدود الدليل المستخدم.");
    });

    container.querySelector("#runInstitutionBatch")?.addEventListener("click", async () => {
      const button = container.querySelector("#runInstitutionBatch");
      const status = container.querySelector("#institutionBatchStatus");
      let records;
      try {
        records = JSON.parse(container.querySelector("#institutionRecords").value);
      } catch {
        status.innerHTML = statusLine("Enter a valid JSON array.", "أدخل مصفوفة JSON صحيحة.", true);
        return;
      }
      if (!Array.isArray(records)) {
        status.innerHTML = statusLine("The bulk input must be a JSON array.", "يجب أن تكون البيانات المجمعة مصفوفة JSON.", true);
        return;
      }
      button.disabled = true;
      status.innerHTML = statusLine(`Processing ${records.length} record${records.length === 1 ? "" : "s"}…`, `جارٍ معالجة ${records.length} سجل…`);
      const result = await CloudSync.runInstitutionBatch(
        container.querySelector("#institutionAction").value,
        records,
      );
      button.disabled = false;
      if (!result.ok) {
        const message = localizedError(result.error, "Bulk processing failed.", "فشلت المعالجة المجمعة.");
        status.innerHTML = statusLine(message, message, true);
        return;
      }
      container.querySelector("#institutionBatchResults").innerHTML = renderInstitutionBatch(result.data.batch);
      status.innerHTML = statusLine(
        `${number(result.data.batch.successCount)} successful · ${number(result.data.batch.failedCount)} failed · ${number(result.data.batch.recordCount)} total.`,
        `${number(result.data.batch.successCount)} ناجح · ${number(result.data.batch.failedCount)} فاشل · ${number(result.data.batch.recordCount)} إجمالي.`,
      );
    });

    container.querySelector("#createInstitutionKey")?.addEventListener("click", async () => {
      const button = container.querySelector("#createInstitutionKey");
      const status = container.querySelector("#institutionKeyStatus");
      button.disabled = true;
      const result = await CloudSync.createInstitutionKey(
        container.querySelector("#institutionKeyName").value.trim(),
      );
      button.disabled = false;
      if (!result.ok) {
        const message = localizedError(result.error, "API key creation failed.", "فشل إنشاء مفتاح API.");
        status.innerHTML = statusLine(message, message, true);
        return;
      }
      const refreshed = await CloudSync.listInstitutionKeys();
      institutionKeys = refreshed.ok ? refreshed.data.keys || [] : institutionKeys;
      container.querySelector("#institutionKeys").innerHTML = renderInstitutionKeys(institutionKeys);
      status.innerHTML = `<div class="share-created"><p class="setup-status__text"><strong>${L("Copy this secret now; it will not be shown again.", "انسخ هذا المفتاح الآن؛ لن يظهر مرة أخرى.")}</strong></p><div class="copy-link-row"><input id="institutionToken" readonly value="${escapeHtml(result.data.token)}"><button class="btn btn--ghost" id="copyInstitutionToken" type="button">${L("Copy", "نسخ")}</button></div></div>`;
      container.querySelector("#copyInstitutionToken")?.addEventListener("click", async () => {
        await navigator.clipboard.writeText(result.data.token);
        container.querySelector("#copyInstitutionToken").textContent = L("Copied", "تم النسخ");
      });
      wireInstitutionRevokes();
    });

    function wireInstitutionRevokes() {
      container.querySelectorAll("[data-revoke-institution-key]").forEach((button) => {
        button.addEventListener("click", async () => {
          if (!window.confirm(L("Revoke this institutional API key? Existing integrations will stop immediately.", "هل تريد إلغاء مفتاح API المؤسسي؟ ستتوقف التكاملات الحالية فورًا."))) return;
          const result = await CloudSync.revokeInstitutionKey(button.dataset.revokeInstitutionKey);
          const status = container.querySelector("#institutionKeyStatus");
          if (!result.ok) {
            const message = localizedError(result.error, "API key revocation failed.", "فشل إلغاء مفتاح API.");
            status.innerHTML = statusLine(message, message, true);
            return;
          }
          const refreshed = await CloudSync.listInstitutionKeys();
          institutionKeys = refreshed.ok ? refreshed.data.keys || [] : institutionKeys;
          container.querySelector("#institutionKeys").innerHTML = renderInstitutionKeys(institutionKeys);
          status.innerHTML = statusLine("API key revoked.", "تم إلغاء مفتاح API.");
          wireInstitutionRevokes();
        }, { once: true });
      });
    }
    wireInstitutionRevokes();

    container.querySelector("#runIntegrity")?.addEventListener("click", async () => {
      const button = container.querySelector("#runIntegrity");
      const status = container.querySelector("#integrityStatus");
      const file = container.querySelector("#integrityFile").files[0];
      const savedFingerprint = Storage.get("transcriptFingerprint:v1", null);
      if (!file && !savedFingerprint?.sha256) {
        status.innerHTML = statusLine("Import a transcript first or choose the transcript file once.", "استورد الترانسكريبت أولًا أو اختر ملفه مرة واحدة.", true);
        return;
      }
      button.disabled = true;
      status.innerHTML = statusLine("Creating a SHA-256 fingerprint…", "جارٍ إنشاء بصمة SHA-256…");
      const hash = file ? await crypto.subtle.digest("SHA-256", await file.arrayBuffer()) : null;
      const sha256 = hash ? [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("") : savedFingerprint.sha256;
      const fileMeta = file
        ? { name: "Transcript selected for review", type: file.type, size: file.size, sha256 }
        : { name: "Imported transcript", type: savedFingerprint.mimeType, size: savedFingerprint.bytes, sha256 };
      const result = await CloudSync.runProAnalysis("integrity", {
        file: fileMeta,
        courses: AcademicRecord.courses(),
      });
      button.disabled = false;
      if (!result.ok) {
        const message = localizedError(result.error, "Consistency review failed.", "فشلت مراجعة الاتساق.");
        status.innerHTML = statusLine(message, message, true);
        return;
      }
      workspace.integrity = {
        ...result.data.result,
        file: fileMeta,
        generatedAt: new Date().toISOString(),
      };
      await saveWorkspace(L("Consistency review saved.", "تم حفظ مراجعة الاتساق."));
      container.querySelector("#integrityResults").innerHTML = renderIntegrity(workspace.integrity);
      status.innerHTML = statusLine("Review complete.", "اكتملت المراجعة.");
    });

    container.querySelector("#createAdvisorLink")?.addEventListener("click", async () => {
      const button = container.querySelector("#createAdvisorLink");
      const status = container.querySelector("#advisorStatus");
      const title = container.querySelector("#advisorTitle").value.trim();
      if (!title) {
        status.innerHTML = statusLine("Add a title for the adviser.", "أضف عنوانًا للمرشد.", true);
        return;
      }
      button.disabled = true;
      const result = await CloudSync.createReportShare({
        title,
        scope: "full",
        expiresInDays: number(container.querySelector("#advisorExpiry").value, 7),
        password: container.querySelector("#advisorPassword").value,
        payload: advisorPayload(workspace),
      });
      button.disabled = false;
      if (!result.ok) {
        const message = localizedError(result.error, "The adviser link could not be created.", "تعذر إنشاء رابط المرشد.");
        status.innerHTML = statusLine(message, message, true);
        return;
      }
      workspace.advisorLinks.unshift({
        title,
        url: result.data.url,
        expiresAt: result.data.expiresAt,
        createdAt: new Date().toISOString(),
      });
      workspace.advisorLinks = workspace.advisorLinks.slice(0, 20);
      await saveWorkspace(L("Adviser link added to the Pro workspace.", "تمت إضافة رابط المرشد إلى مساحة Pro."));
      status.innerHTML = `<div class="share-created"><p class="setup-status__text">${L("Read-only adviser link created.", "تم إنشاء رابط مرشد للقراءة فقط.")}</p><label class="field"><span>${L("Copy this link now", "انسخ هذا الرابط الآن")}</span><div class="copy-link-row"><input id="proAdvisorUrl" readonly value="${escapeHtml(result.data.url)}"><button class="btn btn--ghost" type="button" id="copyAdvisorUrl">${L("Copy", "نسخ")}</button></div></label></div>`;
      container.querySelector("#copyAdvisorUrl")?.addEventListener("click", async () => {
        await navigator.clipboard.writeText(result.data.url);
        container.querySelector("#copyAdvisorUrl").textContent = L("Copied", "تم النسخ");
      });
      container.querySelector("#advisorLinks").innerHTML = renderAdvisorLinks(workspace);
    });
    container.querySelector("#saveAdvisorDecision")?.addEventListener("click", async () => {
      const selectedId = container.querySelector("#advisorDecisionCourse").value;
      const course = AcademicState.mergedCourses().find((item) => (item.attemptId || item.id) === selectedId);
      const reference = container.querySelector("#advisorDecisionReference").value.trim();
      const status = container.querySelector("#advisorDecisionStatus");
      if (!reference) { status.innerHTML = statusLine("Add an official URL or case number.", "أضف رابطًا رسميًا أو رقم الطلب.", true); return; }
      workspace.advisorDecisions.unshift({
        id: crypto.randomUUID(), courseId: selectedId || null,
        courseLabel: course ? [course.code, course.name].filter(Boolean).join(" · ") : L("Programme", "البرنامج"),
        type: container.querySelector("#advisorDecisionType").value,
        reference, note: container.querySelector("#advisorDecisionNote").value.trim(), recordedAt: new Date().toISOString(),
      });
      workspace.advisorDecisions = workspace.advisorDecisions.slice(0, 200);
      await saveWorkspace(L("Adviser evidence log saved.", "تم حفظ سجل دليل المرشد."));
      renderPanels(); wireCurrentPanels(); activatePanel("advisor", { focus: false });
    });
  }
}
