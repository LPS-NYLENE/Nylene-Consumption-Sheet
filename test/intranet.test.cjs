const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const XLSX = require("xlsx");

const excelPath = path.join(
    os.tmpdir(),
    `nylene-consumption-${process.pid}-${Date.now()}.xlsx`,
);

process.env.HOST = "127.0.0.1";
process.env.PORT = "0";
process.env.EXCEL_FILE_PATH = excelPath;
process.env.ALLOW_PUBLIC = "false";
delete process.env.CORS_ORIGIN;

const {
    isAllowedClientIp,
    isFileLockError,
    startServer,
    flushExcel,
    getLedgerFilePath,
    shiftDisplayTime,
    DISPLAY_TIME_OFFSET_HOURS,
    DUPLICATE_BOX_MESSAGE,
    shouldEnforceUniqueBoxNumber,
    inferChipType,
    isBoxNumberEditableForEntry,
} = require("../server.cjs");

function request(port, { method = "GET", url = "/", body } = {}) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const req = http.request(
            {
                hostname: "127.0.0.1",
                port,
                method,
                path: url,
                headers: payload
                    ? {
                          "Content-Type": "application/json",
                          "Content-Length": Buffer.byteLength(payload),
                      }
                    : {},
            },
            (res) => {
                const chunks = [];
                res.on("data", (chunk) => chunks.push(chunk));
                res.on("end", () => {
                    const text = Buffer.concat(chunks).toString("utf8");
                    let json = null;
                    try {
                        json = JSON.parse(text);
                    } catch (error) {
                        json = null;
                    }
                    resolve({
                        status: res.statusCode,
                        text,
                        json,
                        headers: res.headers,
                    });
                });
            },
        );
        req.on("error", reject);
        if (payload) {
            req.write(payload);
        }
        req.end();
    });
}

function sampleEntry(boxNumber, extra = {}) {
    return {
        boxNumber,
        product: "CSDN-INT",
        operatorName: "Test Operator",
        destination: "DCA",
        netWeight: "12.5",
        chipType: "box",
        ...extra,
    };
}

test("shiftDisplayTime moves clocks three hours forward", () => {
    const sevenAm = new Date(2026, 8, 2, 7, 0, 0);
    const shifted = shiftDisplayTime(sevenAm);
    assert.equal(shifted.getHours(), 10);
    assert.equal(shifted.getMinutes(), 0);
    assert.equal(shifted.getDate(), 2);
    assert.equal(DISPLAY_TIME_OFFSET_HOURS, 3);

    const tenPm = new Date(2026, 8, 2, 22, 15, 0);
    const nextDay = shiftDisplayTime(tenPm);
    assert.equal(nextDay.getHours(), 1);
    assert.equal(nextDay.getMinutes(), 15);
    assert.equal(nextDay.getDate(), 3);
});

test("shouldEnforceUniqueBoxNumber applies to scanned boxes only", () => {
    assert.equal(shouldEnforceUniqueBoxNumber("AD1620301", "box"), true);
    assert.equal(shouldEnforceUniqueBoxNumber("A-Bulk", "bulk"), false);
    assert.equal(shouldEnforceUniqueBoxNumber("BASF", "purchased"), false);
    assert.equal(shouldEnforceUniqueBoxNumber("A-Bulk", ""), false);
    assert.equal(shouldEnforceUniqueBoxNumber("AD1620301", ""), true);
});

test("inferChipType and box editability use stored type or box identifiers", () => {
    assert.equal(inferChipType({ chipType: "box", boxNumber: "AD1620301" }), "box");
    assert.equal(inferChipType({ chipType: "bulk", boxNumber: "A-Bulk" }), "bulk");
    assert.equal(
        inferChipType({ chipType: "purchased", boxNumber: "BASF" }),
        "purchased",
    );
    assert.equal(inferChipType({ boxNumber: "C-Bulk" }), "bulk");
    assert.equal(inferChipType({ boxNumber: "MOHAWK" }), "purchased");
    assert.equal(inferChipType({ boxNumber: "AD1620301" }), "box");
    assert.equal(
        isBoxNumberEditableForEntry({ chipType: "box", boxNumber: "AD1620301" }),
        true,
    );
    assert.equal(
        isBoxNumberEditableForEntry({ chipType: "bulk", boxNumber: "A-Bulk" }),
        false,
    );
    assert.equal(
        isBoxNumberEditableForEntry({
            chipType: "purchased",
            boxNumber: "BASF",
        }),
        false,
    );
    assert.equal(isBoxNumberEditableForEntry({ boxNumber: "Other" }), false);
});

test("isFileLockError detects Windows Excel lock codes", () => {
    assert.equal(isFileLockError({ code: "EBUSY" }), true);
    assert.equal(isFileLockError({ code: "EPERM" }), true);
    assert.equal(
        isFileLockError({ message: "A sharing violation occurred" }),
        true,
    );
    assert.equal(isFileLockError({ code: "ENOENT" }), false);
});

test("isAllowedClientIp allows intranet and loopback addresses only", () => {
    assert.equal(isAllowedClientIp("127.0.0.1", false), true);
    assert.equal(isAllowedClientIp("::1", false), true);
    assert.equal(isAllowedClientIp("::ffff:192.168.10.4", false), true);
    assert.equal(isAllowedClientIp("10.1.2.3", false), true);
    assert.equal(isAllowedClientIp("172.16.0.8", false), true);
    assert.equal(isAllowedClientIp("169.254.1.1", false), true);
    assert.equal(isAllowedClientIp("8.8.8.8", false), false);
    assert.equal(isAllowedClientIp("1.1.1.1", false), false);
    assert.equal(isAllowedClientIp("8.8.8.8", true), true);
});

test("intranet server serves the app, centralizes saves, and lists shared entries", async (t) => {
    const server = startServer();
    await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
    });
    const { port } = server.address();

    t.after(() => {
        server.close();
        fs.rmSync(excelPath, { force: true });
        fs.rmSync(getLedgerFilePath(), { force: true });
    });

    const home = await request(port, { url: "/" });
    assert.equal(home.status, 200);
    assert.match(home.text, /Nylene Consumption Sheet/);
    assert.match(home.text, /records.html/);

    const recordsPage = await request(port, { url: "/records.html" });
    assert.equal(recordsPage.status, 200);
    assert.match(recordsPage.text, /Recent Entries/);
    assert.match(recordsPage.text, /id="records-search"/);
    assert.match(recordsPage.text, /Operator name or box number/);
    assert.match(recordsPage.text, /id="records-pagination"/);
    assert.match(recordsPage.text, /id="edit-destination"/);
    assert.match(recordsPage.text, /<select[\s\S]*id="edit-destination"/);

    const destinationPage = await request(port, { url: "/destination.html" });
    assert.equal(destinationPage.status, 200);
    const mainFlowDestinations = [
        ...destinationPage.text.matchAll(
            /name="destination"[\s\S]*?value="([^"]+)"/g,
        ),
    ].map((match) => match[1]);
    const editDestinationMarkup = recordsPage.text.match(
        /id="edit-destination"[\s\S]*?<\/select>/,
    );
    assert.ok(editDestinationMarkup);
    const editDestinations = [
        ...editDestinationMarkup[0].matchAll(/<option value="([^"]+)"/g),
    ].map((match) => match[1]);
    assert.ok(mainFlowDestinations.length > 0);
    assert.deepEqual(editDestinations, mainFlowDestinations);
    assert.match(recordsPage.text, />Action</);
    assert.match(recordsPage.text, /id="password-modal"/);
    assert.match(recordsPage.text, /type="password"/);
    assert.match(recordsPage.text, /Modify record/);
    assert.equal(recordsPage.text.toLowerCase().includes("quality2026"), false);

    const blockedFile = await request(port, { url: "/server.cjs" });
    assert.equal(blockedFile.status, 404);

    const health = await request(port, { url: "/health" });
    assert.equal(health.status, 200);
    assert.equal(health.json.ok, true);
    assert.equal(health.json.mode, "intranet");

    const missing = await request(port, {
        method: "POST",
        url: "/save",
        body: { boxNumber: "AB1" },
    });
    assert.equal(missing.status, 400);

    const beforeSave = Date.now();
    const first = await request(port, {
        method: "POST",
        url: "/save",
        body: sampleEntry("BOXAAA1"),
    });
    const afterSave = Date.now();
    assert.equal(first.status, 200);
    assert.equal(first.json.success, true);
    assert.ok(first.json.date);
    assert.ok(first.json.time);

    const savedAtMs = new Date(first.json.savedAt).getTime();
    const offsetMs = DISPLAY_TIME_OFFSET_HOURS * 60 * 60 * 1000;
    assert.ok(savedAtMs >= beforeSave + offsetMs - 2000);
    assert.ok(savedAtMs <= afterSave + offsetMs + 2000);

    const duplicate = await request(port, {
        method: "POST",
        url: "/save",
        body: sampleEntry("BOXAAA1"),
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.json.error, DUPLICATE_BOX_MESSAGE);

    const duplicateCase = await request(port, {
        method: "POST",
        url: "/save",
        body: sampleEntry("boxaaa1"),
    });
    assert.equal(duplicateCase.status, 409);
    assert.equal(duplicateCase.json.error, DUPLICATE_BOX_MESSAGE);

    const [second, third] = await Promise.all([
        request(port, {
            method: "POST",
            url: "/save",
            body: sampleEntry("BOXBBB2"),
        }),
        request(port, {
            method: "POST",
            url: "/save",
            body: sampleEntry("BOXCCC3"),
        }),
    ]);
    assert.equal(second.status, 200);
    assert.equal(third.status, 200);

    const listing = await request(port, { url: "/api/entries" });
    assert.equal(listing.status, 200);
    const boxNumbers = listing.json.entries.map((entry) => entry.boxNumber);
    assert.deepEqual(new Set(boxNumbers), new Set(["BOXAAA1", "BOXBBB2", "BOXCCC3"]));

    const workbook = XLSX.readFile(excelPath);
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Sheet1, {
        header: 1,
    });
    const savedBoxes = rows.slice(1).map((row) => row[0]);
    assert.deepEqual(
        new Set(savedBoxes),
        new Set(["BOXAAA1", "BOXBBB2", "BOXCCC3"]),
    );

    const originalWriteFile = XLSX.writeFile;
    XLSX.writeFile = () => {
        const error = new Error(
            "EBUSY: resource busy or locked, open 'workbook.xlsx'",
        );
        error.code = "EBUSY";
        throw error;
    };

    try {
        const lockedSave = await request(port, {
            method: "POST",
            url: "/save",
            body: sampleEntry("BOXLOCK4"),
        });
        assert.equal(lockedSave.status, 200);
        assert.equal(lockedSave.json.success, true);
        assert.equal(lockedSave.json.excelSynced, false);

        const listingWhileLocked = await request(port, { url: "/api/entries" });
        const lockedBoxes = listingWhileLocked.json.entries.map(
            (entry) => entry.boxNumber,
        );
        assert.equal(lockedBoxes.includes("BOXLOCK4"), true);

        const workbookWhileLocked = XLSX.readFile(excelPath);
        const rowsWhileLocked = XLSX.utils.sheet_to_json(
            workbookWhileLocked.Sheets.Sheet1,
            { header: 1 },
        );
        assert.equal(
            rowsWhileLocked.slice(1).map((row) => row[0]).includes("BOXLOCK4"),
            false,
        );
    } finally {
        XLSX.writeFile = originalWriteFile;
    }

    const flushed = await flushExcel();
    assert.equal(flushed, true);
    const workbookAfterFlush = XLSX.readFile(excelPath);
    const rowsAfterFlush = XLSX.utils.sheet_to_json(
        workbookAfterFlush.Sheets.Sheet1,
        { header: 1 },
    );
    assert.equal(
        rowsAfterFlush.slice(1).map((row) => row[0]).includes("BOXLOCK4"),
        true,
    );

    const bulkOne = await request(port, {
        method: "POST",
        url: "/save",
        body: sampleEntry("A-Bulk", { chipType: "bulk" }),
    });
    const bulkTwo = await request(port, {
        method: "POST",
        url: "/save",
        body: sampleEntry("A-Bulk", { chipType: "bulk" }),
    });
    assert.equal(bulkOne.status, 200);
    assert.equal(bulkTwo.status, 200);

    const purchased = await request(port, {
        method: "POST",
        url: "/save",
        body: sampleEntry("BASF", {
            chipType: "purchased",
            product: "PURCHASED",
        }),
    });
    assert.equal(purchased.status, 200);

    const listingForModify = await request(port, { url: "/api/entries" });
    assert.equal(listingForModify.status, 200);
    const modifyEntries = listingForModify.json.entries;
    const entryIds = modifyEntries.map((entry) => entry.id);
    assert.equal(
        entryIds.every((id) => typeof id === "string" && id.length > 0),
        true,
    );
    assert.equal(new Set(entryIds).size, entryIds.length);

    const boxEntry = modifyEntries.find((entry) => entry.boxNumber === "BOXAAA1");
    const bulkEntry = modifyEntries.find(
        (entry) => entry.boxNumber === "A-Bulk" && entry.chipType === "bulk",
    );
    const purchasedEntry = modifyEntries.find(
        (entry) => entry.boxNumber === "BASF" && entry.chipType === "purchased",
    );
    assert.ok(boxEntry);
    assert.ok(bulkEntry);
    assert.ok(purchasedEntry);

    const wrongPassword = await request(port, {
        method: "POST",
        url: "/api/verify-modify",
        body: { password: "not-the-password" },
    });
    assert.equal(wrongPassword.status, 401);
    assert.equal(wrongPassword.json.error, "Incorrect password.");
    assert.equal(wrongPassword.json.token, undefined);

    const emptyPassword = await request(port, {
        method: "POST",
        url: "/api/verify-modify",
        body: { password: "" },
    });
    assert.equal(emptyPassword.status, 401);

    const verifyOk = await request(port, {
        method: "POST",
        url: "/api/verify-modify",
        body: { password: "QUALITY2026!" },
    });
    assert.equal(verifyOk.status, 200);
    assert.equal(verifyOk.json.success, true);
    assert.equal(typeof verifyOk.json.token, "string");
    assert.ok(verifyOk.json.token.length > 20);
    assert.equal(JSON.stringify(verifyOk.json).includes("quality2026"), false);

    const unauthorizedUpdate = await request(port, {
        method: "PATCH",
        url: `/api/entries/${boxEntry.id}`,
        body: {
            product: "BS700D",
            netWeight: "99.5",
            boxNumber: "BOXAAA1",
        },
    });
    assert.equal(unauthorizedUpdate.status, 401);

    const missingRecord = await request(port, {
        method: "PATCH",
        url: "/api/entries/missing-record-id",
        body: {
            token: verifyOk.json.token,
            product: "BS700D",
            destination: "DCA",
            netWeight: "99.5",
            boxNumber: "BOXNEW99",
        },
    });
    assert.equal(missingRecord.status, 404);

    const missingDestination = await request(port, {
        method: "PATCH",
        url: `/api/entries/${boxEntry.id}`,
        body: {
            token: verifyOk.json.token,
            product: "BS700D",
            destination: "",
            netWeight: "99.5",
            boxNumber: "BOXAAA1",
        },
    });
    assert.equal(missingDestination.status, 400);
    assert.equal(
        missingDestination.json.error,
        "Please select a chip destination.",
    );

    const updateBox = await request(port, {
        method: "PATCH",
        url: `/api/entries/${boxEntry.id}`,
        body: {
            token: verifyOk.json.token,
            product: "BS700D",
            destination: "DCB",
            netWeight: "99.5",
            boxNumber: "BOXAAA1X",
        },
    });
    assert.equal(updateBox.status, 200);
    assert.equal(updateBox.json.success, true);
    assert.equal(updateBox.json.entry.id, boxEntry.id);
    assert.equal(updateBox.json.entry.product, "BS700D");
    assert.equal(updateBox.json.entry.netWeight, "99.5");
    assert.equal(updateBox.json.entry.boxNumber, "BOXAAA1X");
    assert.equal(updateBox.json.entry.operatorName, boxEntry.operatorName);
    assert.equal(updateBox.json.entry.destination, "DCB");
    assert.equal(updateBox.json.entry.date, boxEntry.date);
    assert.equal(updateBox.json.entry.time, boxEntry.time);

    const afterBoxUpdate = await request(port, { url: "/api/entries" });
    const updatedBox = afterBoxUpdate.json.entries.find(
        (entry) => entry.id === boxEntry.id,
    );
    assert.equal(updatedBox.product, "BS700D");
    assert.equal(updatedBox.netWeight, "99.5");
    assert.equal(updatedBox.boxNumber, "BOXAAA1X");
    assert.equal(updatedBox.destination, "DCB");
    assert.equal(
        afterBoxUpdate.json.entries.some((entry) => entry.boxNumber === "BOXAAA1"),
        false,
    );

    const duplicateUpdate = await request(port, {
        method: "PATCH",
        url: `/api/entries/${boxEntry.id}`,
        body: {
            token: verifyOk.json.token,
            product: "BS700D",
            destination: "DCB",
            netWeight: "99.5",
            boxNumber: "BOXBBB2",
        },
    });
    assert.equal(duplicateUpdate.status, 409);

    const ignoredBulkBoxChange = await request(port, {
        method: "PATCH",
        url: `/api/entries/${bulkEntry.id}`,
        body: {
            token: verifyOk.json.token,
            product: "BS640T",
            destination: "A-Dryer",
            netWeight: "40",
            boxNumber: "SHOULDNOTAPPLY",
        },
    });
    assert.equal(ignoredBulkBoxChange.status, 200);
    assert.equal(ignoredBulkBoxChange.json.entry.id, bulkEntry.id);
    assert.equal(ignoredBulkBoxChange.json.entry.boxNumber, "A-Bulk");
    assert.equal(ignoredBulkBoxChange.json.entry.product, "BS640T");
    assert.equal(ignoredBulkBoxChange.json.entry.netWeight, "40");
    assert.equal(ignoredBulkBoxChange.json.entry.destination, "A-Dryer");
    assert.equal(
        ignoredBulkBoxChange.json.entry.operatorName,
        bulkEntry.operatorName,
    );

    const ignoredPurchasedBoxChange = await request(port, {
        method: "PATCH",
        url: `/api/entries/${purchasedEntry.id}`,
        body: {
            token: verifyOk.json.token,
            product: "PURCHASED",
            destination: "D-Dryer",
            netWeight: "18",
            boxNumber: "NEWBOX99",
        },
    });
    assert.equal(ignoredPurchasedBoxChange.status, 200);
    assert.equal(ignoredPurchasedBoxChange.json.entry.id, purchasedEntry.id);
    assert.equal(ignoredPurchasedBoxChange.json.entry.boxNumber, "BASF");
    assert.equal(ignoredPurchasedBoxChange.json.entry.netWeight, "18");
    assert.equal(ignoredPurchasedBoxChange.json.entry.destination, "D-Dryer");

    const workbookWithIds = XLSX.readFile(excelPath);
    const headerRow = XLSX.utils.sheet_to_json(workbookWithIds.Sheets.Sheet1, {
        header: 1,
    })[0];
    assert.deepEqual(headerRow.slice(0, 7), [
        "Box Number",
        "Product",
        "Operator Name",
        "Chip Destination",
        "Date",
        "Time",
        "Net Weight",
    ]);
    assert.equal(headerRow.includes("ID"), true);
    assert.equal(headerRow.includes("Chip Type"), true);
});
