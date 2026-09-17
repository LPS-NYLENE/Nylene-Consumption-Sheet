const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function loadRecordsHelpers() {
    const source = fs.readFileSync(
        path.join(__dirname, "..", "app.js"),
        "utf8",
    );
    const start = source.indexOf("const RECORDS_PAGE_SIZE");
    const end = source.indexOf("function initRecordsPage");
    assert.ok(
        start >= 0 && end > start,
        "records helpers should exist in app.js",
    );
    const context = {
        normalizeText(value) {
            return value ? String(value).trim() : "";
        },
    };
    vm.runInNewContext(
        `${source.slice(start, end)}
this.RECORDS_PAGE_SIZE = RECORDS_PAGE_SIZE;
this.filterRecordsBySearch = filterRecordsBySearch;
this.paginateRecords = paginateRecords;
`,
        context,
    );
    return context;
}

test("filterRecordsBySearch matches operator name or box number", () => {
    const { filterRecordsBySearch } = loadRecordsHelpers();
    const entries = [
        { boxNumber: "AD2620301", operatorName: "Jane Doe" },
        { boxNumber: "BX100", operatorName: "John Smith" },
        { boxNumber: "A-Bulk", operatorName: "Jane Roe" },
    ];

    assert.deepEqual(
        filterRecordsBySearch(entries, "jane").map((entry) => entry.boxNumber),
        ["AD2620301", "A-Bulk"],
    );
    assert.deepEqual(
        filterRecordsBySearch(entries, "ad26").map((entry) => entry.boxNumber),
        ["AD2620301"],
    );
    assert.deepEqual(
        filterRecordsBySearch(entries, "  JOHN  ").map((entry) => entry.operatorName),
        ["John Smith"],
    );
    assert.equal(filterRecordsBySearch(entries, "").length, 3);
    assert.equal(filterRecordsBySearch(entries, "missing").length, 0);
});

test("paginateRecords shows 20 items per page and clamps the page", () => {
    const { paginateRecords, RECORDS_PAGE_SIZE } = loadRecordsHelpers();
    assert.equal(RECORDS_PAGE_SIZE, 20);

    const entries = Array.from({ length: 45 }, (_, index) => ({
        boxNumber: `BOX${index + 1}`,
    }));

    const first = paginateRecords(entries, 1);
    assert.equal(first.items.length, 20);
    assert.equal(first.currentPage, 1);
    assert.equal(first.totalPages, 3);
    assert.equal(first.startItem, 1);
    assert.equal(first.endItem, 20);
    assert.equal(first.items[0].boxNumber, "BOX1");

    const last = paginateRecords(entries, 3);
    assert.equal(last.items.length, 5);
    assert.equal(last.currentPage, 3);
    assert.equal(last.startItem, 41);
    assert.equal(last.endItem, 45);

    const clamped = paginateRecords(entries, 99);
    assert.equal(clamped.currentPage, 3);

    const empty = paginateRecords([], 4);
    assert.equal(empty.currentPage, 1);
    assert.equal(empty.items.length, 0);
    assert.equal(empty.startItem, 0);
    assert.equal(empty.endItem, 0);
});
