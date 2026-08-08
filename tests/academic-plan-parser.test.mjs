import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAcademicPlanLayout,
  studyPlanStatus,
} from "../static-site/assets/academic-plan-parser.js";

const cell = (x, value) => ({ x, value });

test("two-column plans derive their columns and read the published program-credit total", () => {
  const pages = [{
    width: 594,
    groups: [
      { y: 120, cells: [cell(130, "SEMESTER ( 5 )"), cell(425, "SEMESTER ( 6 )")] },
      { y: 110, cells: [
        cell(15, "Code"), cell(88, "Course Title"), cell(180, "Term"), cell(217, "Preq.Code"), cell(265, "Cl"), cell(285, "Gr."),
        cell(312, "Code"), cell(385, "Course Title"), cell(477, "Term"), cell(514, "Preq.Code"), cell(562, "Cl"), cell(582, "Gr."),
      ] },
      { y: 100, cells: [cell(6, "CB361"), cell(42, "Engineering Geology"), cell(225, "None"), cell(287, "D"), cell(303, "CB312"), cell(339, "System Analysis"), cell(520, "BA329"), cell(584, "U")] },
      { y: 90, cells: [cell(6, "BA329"), cell(42, "Probability & Statistics"), cell(223, "BA124"), cell(285, "B+"), cell(303, "CB313"), cell(339, "Quality Control"), cell(520, "BA329"), cell(584, "--")] },
      { y: 80, cells: [cell(6, "CB352"), cell(42, "Construction Materials"), cell(223, "CB251"), cell(285, "C+")] },
    ],
  }];
  const result = parseAcademicPlanLayout(
    pages,
    "Core And Elective Course List\nConstruction and Building Engineering, Cairo\nPreq.Code\nTotal program: 180 credits",
  );
  assert.equal(result.rows.length, 5);
  assert.equal(result.suggestedProgramCredits, 180);
  assert.equal(result.rows.find((row) => row[1] === "CB312")[4], "U");
  assert.equal(result.rows.find((row) => row[1] === "CB312")[6], "BA329");
});

test("a one-column curriculum with different spacing is parsed without institution-specific ratios", () => {
  const result = parseAcademicPlanLayout([{
    width: 700,
    groups: [
      { y: 100, cells: [cell(10, "Code"), cell(130, "Course Name"), cell(410, "Credit Hours"), cell(500, "Prerequisite"), cell(620, "Grade")] },
      { y: 90, cells: [cell(12, "CS101"), cell(132, "Programming I"), cell(414, "3"), cell(505, "None"), cell(625, "A")] },
      { y: 80, cells: [cell(12, "CS102"), cell(132, "Programming II"), cell(414, "4"), cell(505, "CS101"), cell(625, "U")] },
      { y: 70, cells: [cell(12, "MA101"), cell(132, "Calculus"), cell(414, "3"), cell(505, "None"), cell(625, "B+")] },
    ],
  }], "Curriculum course name code prerequisite · Degree requires 120 credits");
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[1][1], "CS102");
  assert.equal(result.rows[1][3], 4);
  assert.equal(result.rows[1][6], "CS101");
  assert.equal(result.suggestedProgramCredits, 120);
});

test("U is ungraded only in study-plan context", () => {
  assert.equal(studyPlanStatus("U", "study-plan"), "in_progress");
  assert.equal(studyPlanStatus("U", "transcript"), "graded");
});

test("full ten-semester geometry keeps 84 courses and two current U registrations", () => {
  const groups = [];
  const countsPerSide = [9, 9, 8, 8, 8];
  countsPerSide.forEach((count, pairIndex) => {
    const leftSemester = pairIndex * 2 + 1;
    const rightSemester = leftSemester + 1;
    const topY = 1_000 - pairIndex * 150;
    groups.push({
      y: topY,
      cells: [cell(130, `SEMESTER ( ${leftSemester} )`), cell(425, `SEMESTER ( ${rightSemester} )`)],
    });
    groups.push({
      y: topY - 10,
      cells: [
        cell(15, "Code"), cell(88, "Course Title"), cell(180, "Term"), cell(217, "Preq.Code"), cell(265, "Cl"), cell(285, "Gr."),
        cell(312, "Code"), cell(385, "Course Title"), cell(477, "Term"), cell(514, "Preq.Code"), cell(562, "Cl"), cell(582, "Gr."),
      ],
    });
    for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
      const leftGrade = leftSemester === 7 && rowIndex === 0 ? "U" : "--";
      const rightGrade = rightSemester === 6 && rowIndex === 0 ? "U" : "--";
      groups.push({
        y: topY - 20 - rowIndex * 10,
        cells: [
          cell(6, `L${leftSemester}${String(rowIndex).padStart(2, "0")}`),
          cell(42, `Left course ${leftSemester}-${rowIndex}`),
          cell(225, "None"),
          cell(287, leftGrade),
          cell(303, `R${rightSemester}${String(rowIndex).padStart(2, "0")}`),
          cell(339, `Right course ${rightSemester}-${rowIndex}`),
          cell(520, "None"),
          cell(584, rightGrade),
        ],
      });
    }
  });

  const result = parseAcademicPlanLayout(
    [{ width: 612, groups }],
    "Core And Elective Course List\nConstruction and Building Engineering\nPreq.Code",
  );
  assert.equal(result.rows.length, 84);
  assert.equal(new Set(result.rows.map((row) => row[0])).size, 10);
  assert.equal(result.rows.filter((row) => row[4] === "U").length, 2);
});
