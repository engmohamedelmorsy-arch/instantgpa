import { currentLanguage } from "./localization.js";

const L = (english, arabic) => currentLanguage() === "ar" ? arabic : english;
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

const unfoldIcs = (text) => String(text || "").replace(/\r?\n[ \t]/g, "");
const unescapeIcs = (value) => String(value || "").replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
const icsText = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

function parseIcsDate(value) {
  const clean = String(value || "").replace(/Z$/, "");
  const match = clean.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!match) return "";
  const [, year, month, day, hour = "12", minute = "00", second = "00"] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function parseCalendarFile(text, provider = "calendar") {
  const blocks = unfoldIcs(text).match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  return blocks.slice(0, 5_000).map((block) => {
    const properties = {};
    block.split(/\r?\n/).forEach((line) => {
      const separator = line.indexOf(":");
      if (separator < 0) return;
      const key = line.slice(0, separator).split(";")[0].toUpperCase();
      properties[key] = line.slice(separator + 1);
    });
    const startAt = parseIcsDate(properties.DTSTART);
    if (!startAt || !properties.SUMMARY) return null;
    return {
      id: crypto.randomUUID(), provider,
      title: unescapeIcs(properties.SUMMARY).slice(0, 180),
      description: unescapeIcs(properties.DESCRIPTION).slice(0, 1_000),
      location: unescapeIcs(properties.LOCATION).slice(0, 240),
      startAt, endAt: parseIcsDate(properties.DTEND),
      sourceUid: String(properties.UID || "").slice(0, 240), importedAt: new Date().toISOString(),
    };
  }).filter(Boolean);
}

function assessmentEvents(workspace) {
  return (workspace.syllabi || []).flatMap((syllabus) => (syllabus.assessments || []).map((assessment) => {
    const date = new Date(assessment.dueDate);
    if (!assessment.dueDate || Number.isNaN(date.getTime())) return null;
    return {
      id: assessment.id || crypto.randomUUID(), provider: "syllabus",
      title: `${syllabus.courseName}: ${assessment.label}`,
      description: `${assessment.weight ?? L("Unknown", "غير معروف")}% · ${L("target", "الهدف")} ${syllabus.targetScore}%`,
      location: "", startAt: date.toISOString(), endAt: "",
    };
  }).filter(Boolean));
}

export function combinedEvents(workspace) {
  const events = [...assessmentEvents(workspace), ...(workspace.calendarEvents || [])];
  const seen = new Set();
  return events.filter((event) => {
    const key = event.sourceUid || `${event.title}|${event.startAt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
}

function icsDate(date) {
  return new Date(date).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function createCalendarExport(events) {
  const items = events.map((event) => [
    "BEGIN:VEVENT", `UID:${icsText(event.id || crypto.randomUUID())}@instantgpa.com`,
    `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(event.startAt)}`,
    event.endAt ? `DTEND:${icsDate(event.endAt)}` : "",
    `SUMMARY:${icsText(event.title)}`, `DESCRIPTION:${icsText(event.description)}`,
    event.location ? `LOCATION:${icsText(event.location)}` : "", "END:VEVENT",
  ].filter(Boolean).join("\r\n"));
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "CALSCALE:GREGORIAN", "PRODID:-//InstantGPA//Academic Calendar//EN", ...items, "END:VCALENDAR"].join("\r\n");
}

function downloadCalendar(events) {
  const url = URL.createObjectURL(new Blob([createCalendarExport(events)], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "instantgpa-academic-calendar.ics";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function providerLink(event, provider) {
  const start = icsDate(event.startAt);
  const end = icsDate(event.endAt || new Date(new Date(event.startAt).getTime() + 60 * 60 * 1_000));
  if (provider === "google") {
    const params = new URLSearchParams({ action: "TEMPLATE", text: event.title, dates: `${start}/${end}`, details: event.description || "", location: event.location || "" });
    return `https://calendar.google.com/calendar/render?${params}`;
  }
  const params = new URLSearchParams({ path: "/calendar/action/compose", rru: "addevent", subject: event.title, startdt: event.startAt, enddt: event.endAt || new Date(new Date(event.startAt).getTime() + 60 * 60 * 1_000).toISOString(), body: event.description || "", location: event.location || "" });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
}

export function integrationsPanel(workspace) {
  const events = combinedEvents(workspace);
  const future = events.filter((event) => new Date(event.startAt).getTime() >= Date.now());
  const next = future[0];
  const imports = workspace.integrations || {};
  return `
    <div class="pro-grid pro-grid--split">
      <section class="tool-card">
        <span class="section-kicker">${L("Calendar first", "التقويم أولًا")}</span><h3>${L("Put every deadline in the calendar you already use", "ضع كل موعد في التقويم الذي تستخدمه")}</h3>
        <p class="tool-sub">${L("Export one privacy-safe calendar, or add the next deadline directly to Google or Outlook. No calendar password is stored.", "صدّر تقويمًا واحدًا آمنًا للخصوصية، أو أضف الموعد التالي مباشرة إلى Google أو Outlook. لا نخزن كلمة مرور التقويم.")}</p>
        <div class="pro-dashboard-metrics"><article><span>${L("All events", "كل الأحداث")}</span><strong>${events.length}</strong></article><article><span>${L("Upcoming", "قادمة")}</span><strong>${future.length}</strong></article></div>
        <div class="row-actions"><button id="exportAllCalendar" class="btn btn--primary" type="button" ${events.length ? "" : "disabled"}>${L("Download .ics", "تنزيل .ics")}</button>${next ? `<a class="btn btn--ghost" target="_blank" rel="noopener" href="${esc(providerLink(next, "google"))}">${L("Add next to Google", "أضف التالي إلى Google")}</a><a class="btn btn--ghost" target="_blank" rel="noopener" href="${esc(providerLink(next, "outlook"))}">${L("Add next to Outlook", "أضف التالي إلى Outlook")}</a>` : ""}</div>
      </section>
      <section class="tool-card">
        <span class="section-kicker">${L("LMS import", "استيراد منصة الدراسة")}</span><h3>${L("Canvas, Moodle, Blackboard, or Brightspace", "Canvas أو Moodle أو Blackboard أو Brightspace")}</h3>
        <p class="tool-sub">${L("Export an iCalendar (.ics) file from the LMS and import it here. Only structured event fields are saved; the original file is not retained.", "صدّر ملف iCalendar (.ics) من منصة الدراسة وارفعه هنا. نحفظ حقول الأحداث المنظمة فقط ولا نحتفظ بالملف الأصلي.")}</p>
        <label class="field"><span>${L("Platform", "المنصة")}</span><select id="lmsProvider"><option value="canvas">Canvas</option><option value="moodle">Moodle</option><option value="blackboard">Blackboard</option><option value="brightspace">Brightspace</option></select></label>
        <label class="field"><span>${L("Calendar file", "ملف التقويم")}</span><input id="lmsCalendarFile" type="file" accept=".ics,text/calendar"></label>
        <div class="row-actions"><button id="importLmsCalendar" class="btn btn--primary" type="button">${L("Import events", "استيراد الأحداث")}</button><button id="clearLmsCalendar" class="btn btn--text" type="button" ${workspace.calendarEvents?.length ? "" : "disabled"}>${L("Clear LMS events", "مسح أحداث المنصة")}</button></div>
        <div id="integrationStatus" class="setup-status" aria-live="polite"></div>
        ${Object.keys(imports).length ? `<p class="record-connected">● ${L("Last import", "آخر استيراد")}: ${esc(Object.entries(imports).map(([provider, value]) => `${provider} (${value.count})`).join(" · "))}</p>` : ""}
      </section>
    </div>`;
}

export function wireIntegrationsPanel(container, workspace, saveWorkspace, rerender) {
  container.querySelector("#exportAllCalendar")?.addEventListener("click", () => downloadCalendar(combinedEvents(workspace)));
  container.querySelector("#importLmsCalendar")?.addEventListener("click", async () => {
    const status = container.querySelector("#integrationStatus");
    const file = container.querySelector("#lmsCalendarFile")?.files?.[0];
    const provider = container.querySelector("#lmsProvider")?.value || "calendar";
    if (!file || file.size > 5 * 1024 * 1024) {
      status.innerHTML = `<p class="setup-status__text setup-status__text--warn">${L("Choose an .ics file up to 5 MB.", "اختر ملف .ics بحجم أقصى 5 ميجابايت.")}</p>`;
      return;
    }
    const events = parseCalendarFile(await file.text(), provider);
    if (!events.length) {
      status.innerHTML = `<p class="setup-status__text setup-status__text--warn">${L("No valid events were found.", "لم يتم العثور على أحداث صالحة.")}</p>`;
      return;
    }
    workspace.calendarEvents = [...(workspace.calendarEvents || []).filter((event) => event.provider !== provider), ...events];
    workspace.integrations = { ...(workspace.integrations || {}), [provider]: { count: events.length, importedAt: new Date().toISOString() } };
    await saveWorkspace(L(`${events.length} ${provider} events imported.`, `تم استيراد ${events.length} حدثًا من ${provider}.`));
    rerender();
  });
  container.querySelector("#clearLmsCalendar")?.addEventListener("click", async () => {
    workspace.calendarEvents = [];
    workspace.integrations = {};
    await saveWorkspace(L("Imported LMS events cleared.", "تم مسح أحداث منصات الدراسة المستوردة."));
    rerender();
  });
}
