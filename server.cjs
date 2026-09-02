const express = require("express");
const cors = require("cors");
const XLSX = require("xlsx");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Intranet web server: one host serves the UI and stores all saved rows.
const app = express();
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const ALLOW_PUBLIC = parseBoolean(process.env.ALLOW_PUBLIC, false);
const CORS_ORIGIN = getTrimmedString(process.env.CORS_ORIGIN);
const PUBLIC_FILES = new Set([
    "app.js",
    "destination.html",
    "favico.svg",
    "index.html",
    "records.html",
    "style.css",
    "summary.html",
]);
const LOCAL_DEFAULT_FILE_PATH = path.join(
    __dirname,
    "data",
    "consumption-sheet.xlsx",
);
const SHEET_NAME = "Sheet1";
const HEADERS = [
    "Box Number",
    "Product",
    "Operator Name",
    "Chip Destination",
    "Date",
    "Time",
    "Net Weight",
];
const DISPLAY_TIME_OFFSET_HOURS = 3;
const DUPLICATE_BOX_MESSAGE =
    "The box with this Box number has been consumed try another box";
const REUSABLE_BOX_IDENTIFIERS = new Set(
    ["A-Bulk", "B-Bulk", "C-Bulk", "BASF", "AdvanSix", "MOHAWK"].map((value) =>
        value.toLowerCase(),
    ),
);

// Excel path used by the save endpoint (override with EXCEL_FILE_PATH).
const FILE_PATH = getExcelFilePath();

app.disable("x-powered-by");
app.set("trust proxy", false);
app.use(restrictToIntranet);
if (CORS_ORIGIN) {
    app.use(cors({ origin: CORS_ORIGIN }));
}
app.use(express.json({ limit: "1mb" }));
app.use(noCacheHtml);

app.get("/", (req, res) => {
    sendPublicFile(res, "index.html");
});

app.get("/health", (req, res) => {
    res.json({
        ok: true,
        service: "nylene-consumption-sheet",
        mode: ALLOW_PUBLIC ? "open" : "intranet",
    });
});

app.get("/api/entries", async (req, res) => {
    try {
        const entries = await withExcelLock(() => readEntries());
        return res.json({ entries });
    } catch (error) {
        console.error(`Failed to read Excel file at ${FILE_PATH}.`, error);
        return res.status(500).json({ error: "Unable to read saved entries." });
    }
});

app.get("/:file", (req, res, next) => {
    const fileName = req.params.file;
    if (!PUBLIC_FILES.has(fileName)) {
        return next();
    }

    return sendPublicFile(res, fileName);
});

function parseBoolean(value, fallback) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }

    const normalized = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
        return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
        return false;
    }

    return fallback;
}

function getExcelFilePath() {
    if (process.env.EXCEL_FILE_PATH) {
        return path.resolve(process.env.EXCEL_FILE_PATH);
    }

    // return path.resolve(LOCAL_DEFAULT_FILE_PATH);
      return "G:\\Quality Assurrance\\Poly consumption sheets\\Digital PCons 2026\\Nylene Consumption Sheet 2026.xlsx";
    //   return "G:\\Installed Software\\1 Temp\\1 Temp\\Cool Room Consumption Folder\\Nylene consumption sheet.xlsx";
}

function getLedgerFilePath(excelPath = FILE_PATH) {
    const parsed = path.parse(excelPath);
    return path.join(parsed.dir, `${parsed.name}.ledger.json`);
}

function getTrimmedString(value) {
    return typeof value === "string" ? value.trim() : "";
}

function shiftDisplayTime(date, hours = DISPLAY_TIME_OFFSET_HOURS) {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function formatRecordedStamp(date = new Date()) {
    const recorded = shiftDisplayTime(date);
    return {
        recorded,
        date: recorded.toLocaleDateString("en-US"),
        time: recorded.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
        }),
    };
}

function normalizeBoxNumberKey(value) {
    return getTrimmedString(String(value ?? "")).toLowerCase();
}

function shouldEnforceUniqueBoxNumber(boxNumber, chipType) {
    const type = getTrimmedString(chipType).toLowerCase();
    if (type === "bulk" || type === "purchased") {
        return false;
    }
    if (type === "box") {
        return true;
    }

    return !REUSABLE_BOX_IDENTIFIERS.has(normalizeBoxNumberKey(boxNumber));
}

function isBoxNumberConsumed(boxNumber, entries = loadLedger()) {
    const key = normalizeBoxNumberKey(boxNumber);
    if (!key) {
        return false;
    }

    return entries.some(
        (entry) => normalizeBoxNumberKey(entry.boxNumber) === key,
    );
}

function sendPublicFile(res, fileName) {
    return res.sendFile(path.join(__dirname, fileName));
}

function noCacheHtml(req, res, next) {
    if (req.path === "/" || req.path.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-store");
    }
    next();
}

function normalizeIp(rawIp) {
    if (!rawIp) {
        return "";
    }

    let ip = String(rawIp).trim();
    if (ip.startsWith("::ffff:")) {
        ip = ip.slice(7);
    }
    if (ip === "::1") {
        return "127.0.0.1";
    }

    return ip;
}

function isPrivateOrLocalIpv4(ip) {
    const parts = ip.split(".").map((part) => Number(part));
    if (
        parts.length !== 4 ||
        parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
    ) {
        return false;
    }

    const [first, second] = parts;
    if (first === 127 || first === 10) {
        return true;
    }
    if (first === 192 && second === 168) {
        return true;
    }
    if (first === 172 && second >= 16 && second <= 31) {
        return true;
    }
    if (first === 169 && second === 254) {
        return true;
    }

    return false;
}

function isPrivateOrLocalIpv6(ip) {
    const lower = ip.toLowerCase();
    if (lower === "::1") {
        return true;
    }
    if (lower.startsWith("fe80:")) {
        return true;
    }

    const firstHextet = lower.split(":", 1)[0];
    if (firstHextet.length >= 2) {
        const prefix = firstHextet.slice(0, 2);
        if (prefix === "fc" || prefix === "fd") {
            return true;
        }
    }

    return false;
}

function isAllowedClientIp(rawIp, allowPublic = ALLOW_PUBLIC) {
    if (allowPublic) {
        return true;
    }

    const ip = normalizeIp(rawIp);
    if (!ip) {
        return false;
    }
    if (ip.includes(".")) {
        return isPrivateOrLocalIpv4(ip);
    }

    return isPrivateOrLocalIpv6(ip);
}

function restrictToIntranet(req, res, next) {
    const clientIp = req.socket?.remoteAddress;
    if (isAllowedClientIp(clientIp)) {
        return next();
    }

    return res.status(403).json({
        error: "This application is only available on the company intranet.",
    });
}

function getLanAddresses() {
    const addresses = [];
    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {
        for (const networkInterface of interfaces[name] || []) {
            if (networkInterface.internal) {
                continue;
            }

            const family = networkInterface.family;
            if (family !== "IPv4" && family !== 4) {
                continue;
            }

            addresses.push(networkInterface.address);
        }
    }

    return addresses;
}

function headersMatch(expected, actual) {
    if (!Array.isArray(actual) || actual.length < expected.length) {
        return false;
    }

    return expected.every(
        (header, index) =>
            getTrimmedString(actual[index]).toLowerCase() ===
            header.toLowerCase(),
    );
}

// Normalize and validate the incoming payload for required fields.
function validatePayload(body) {
    const boxNumber = getTrimmedString(body?.boxNumber);
    const product = getTrimmedString(body?.product);
    const operatorName = getTrimmedString(body?.operatorName);
    const destination = getTrimmedString(body?.destination);
    const netWeight = getTrimmedString(body?.netWeight);
    const chipType = getTrimmedString(body?.chipType).toLowerCase();

    const missing = [];
    if (!boxNumber) {
        missing.push("boxNumber");
    }
    if (!product) {
        missing.push("product");
    }
    if (!operatorName) {
        missing.push("operatorName");
    }
    if (!destination) {
        missing.push("destination");
    }
    if (!netWeight) {
        missing.push("netWeight");
    }

    return {
        boxNumber,
        product,
        operatorName,
        destination,
        netWeight,
        chipType,
        missing,
    };
}

// Ensure the directory structure exists before writing the Excel file.
function ensureDirectoryExists(filePath) {
    const directory = path.dirname(filePath);
    fs.mkdirSync(directory, { recursive: true });
}

// Load an existing workbook or create a new one.
function loadWorkbook(filePath) {
    if (fs.existsSync(filePath)) {
        return XLSX.readFile(filePath);
    }
    return XLSX.utils.book_new();
}

// Guarantee the worksheet exists and has header row in place.
function getOrCreateWorksheet(workbook) {
    let worksheet = workbook.Sheets[SHEET_NAME];
    if (!worksheet) {
        worksheet = XLSX.utils.aoa_to_sheet([HEADERS]);
        XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAME);
        return worksheet;
    }

    if (!worksheet["!ref"]) {
        XLSX.utils.sheet_add_aoa(worksheet, [HEADERS], { origin: "A1" });
    } else {
        const headerRow = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            range: 0,
        })[0];
        if (!headersMatch(HEADERS, headerRow)) {
            XLSX.utils.sheet_add_aoa(worksheet, [HEADERS], { origin: "A1" });
        }
    }

    return worksheet;
}

function parseDateCell(value) {
    if (value instanceof Date) {
        return {
            year: value.getFullYear(),
            month: value.getMonth() + 1,
            day: value.getDate(),
        };
    }

    if (typeof value === "number" && Number.isFinite(value)) {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (parsed) {
            return {
                year: parsed.y,
                month: parsed.m,
                day: parsed.d,
            };
        }
    }

    const text = getTrimmedString(String(value ?? ""));
    const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!match) {
        return null;
    }

    const [, month, day, year] = match;
    const fullYear = year.length === 2 ? `20${year}` : year;

    return {
        year: Number(fullYear),
        month: Number(month),
        day: Number(day),
    };
}

function parseTimeCell(value) {
    if (value instanceof Date) {
        return {
            hour: value.getHours(),
            minute: value.getMinutes(),
            second: value.getSeconds(),
        };
    }

    if (typeof value === "number" && Number.isFinite(value)) {
        const secondsInDay = 24 * 60 * 60;
        const totalSeconds = Math.round((value % 1) * secondsInDay);

        return {
            hour: Math.floor(totalSeconds / 3600),
            minute: Math.floor((totalSeconds % 3600) / 60),
            second: totalSeconds % 60,
        };
    }

    const text = getTrimmedString(String(value ?? ""));
    const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (!match) {
        return null;
    }

    const [, hourText, minuteText, secondText = "0", meridiem] = match;
    let hour = Number(hourText);
    if (meridiem) {
        const normalizedMeridiem = meridiem.toUpperCase();
        if (normalizedMeridiem === "PM" && hour !== 12) {
            hour += 12;
        } else if (normalizedMeridiem === "AM" && hour === 12) {
            hour = 0;
        }
    }

    return {
        hour,
        minute: Number(minuteText),
        second: Number(secondText),
    };
}

function getRowTimestamp(row) {
    const date = parseDateCell(row[4]);
    const time = parseTimeCell(row[5]);
    if (!date || !time) {
        return null;
    }

    const timestamp = Date.UTC(
        date.year,
        date.month - 1,
        date.day,
        time.hour,
        time.minute,
        time.second,
    );

    return Number.isFinite(timestamp) ? timestamp : null;
}

function sortRowsNewestFirst(rows) {
    return rows
        .map((row, index) => ({
            row,
            index,
            timestamp: getRowTimestamp(row),
        }))
        .sort((left, right) => {
            if (left.timestamp !== null && right.timestamp !== null) {
                return (
                    right.timestamp - left.timestamp || left.index - right.index
                );
            }
            if (left.timestamp !== null) {
                return -1;
            }
            if (right.timestamp !== null) {
                return 1;
            }
            return left.index - right.index;
        })
        .map(({ row }) => row);
}

function rowToEntry(row) {
    return {
        boxNumber: getTrimmedString(String(row[0] ?? "")),
        product: getTrimmedString(String(row[1] ?? "")),
        operatorName: getTrimmedString(String(row[2] ?? "")),
        destination: getTrimmedString(String(row[3] ?? "")),
        date: getTrimmedString(String(row[4] ?? "")),
        time: getTrimmedString(String(row[5] ?? "")),
        netWeight: getTrimmedString(String(row[6] ?? "")),
    };
}

function entryToRow(entry) {
    return [
        entry.boxNumber,
        entry.product,
        entry.operatorName,
        entry.destination,
        entry.date,
        entry.time,
        entry.netWeight,
    ];
}

function isFileLockError(error) {
    const code = String(error?.code || "").toUpperCase();
    if (["EBUSY", "EPERM", "EACCES", "EAGAIN"].includes(code)) {
        return true;
    }

    const message = String(error?.message || "").toLowerCase();
    return (
        message.includes("ebusy") ||
        message.includes("eperm") ||
        message.includes("eacces") ||
        message.includes("locked") ||
        message.includes("sharing violation") ||
        message.includes("resource busy")
    );
}

function readEntriesFromExcel() {
    if (!fs.existsSync(FILE_PATH)) {
        return [];
    }

    try {
        const workbook = loadWorkbook(FILE_PATH);
        const worksheet = workbook.Sheets[SHEET_NAME];
        if (!worksheet) {
            return [];
        }

        const existingRows = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: "",
            blankrows: false,
            raw: false,
        });

        return sortRowsNewestFirst(existingRows.slice(1)).map(rowToEntry);
    } catch (error) {
        if (isFileLockError(error)) {
            return [];
        }
        throw error;
    }
}

function loadLedger() {
    const ledgerPath = getLedgerFilePath();
    if (fs.existsSync(ledgerPath)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
            if (Array.isArray(parsed?.entries)) {
                return parsed.entries.map((entry) =>
                    rowToEntry(entryToRow(entry)),
                );
            }
        } catch (error) {
            console.warn(
                `Could not read ledger at ${ledgerPath}. Falling back to Excel.`,
                error,
            );
        }
    }

    return readEntriesFromExcel();
}

function persistLedger(entries) {
    const ledgerPath = getLedgerFilePath();
    ensureDirectoryExists(ledgerPath);
    fs.writeFileSync(
        ledgerPath,
        `${JSON.stringify({ entries }, null, 2)}\n`,
        "utf8",
    );
}

function writeWorkbookFromEntries(entries) {
    ensureDirectoryExists(FILE_PATH);
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
        HEADERS,
        ...entries.map(entryToRow),
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAME);
    XLSX.writeFile(workbook, FILE_PATH);
}

function readEntries() {
    return loadLedger();
}

let excelChain = Promise.resolve();
let excelSyncPending = false;
let loggedExcelLock = false;
let excelFlushTimer = null;

function withExcelLock(task) {
    const run = excelChain.then(
        () => task(),
        () => task(),
    );
    excelChain = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
}

function markExcelLocked() {
    excelSyncPending = true;
    if (loggedExcelLock) {
        return;
    }
    loggedExcelLock = true;
    console.warn(
        `Excel workbook is open or locked at ${FILE_PATH}. Saves are kept and will be written when the file is closed.`,
    );
}

function markExcelSynced() {
    excelSyncPending = false;
    if (loggedExcelLock) {
        console.log(`Excel workbook updated at ${FILE_PATH}.`);
        loggedExcelLock = false;
    }
}

function tryWriteExcel(entries) {
    try {
        writeWorkbookFromEntries(entries);
        markExcelSynced();
        return true;
    } catch (error) {
        if (isFileLockError(error)) {
            markExcelLocked();
            return false;
        }
        throw error;
    }
}

function saveRow(row) {
    const entry = rowToEntry(row);
    const entries = [entry, ...loadLedger()];
    persistLedger(entries);
    try {
        const excelSynced = tryWriteExcel(entries);
        return { excelSynced };
    } catch (error) {
        console.error(`Failed to update Excel file at ${FILE_PATH}.`, error);
        excelSyncPending = true;
        return { excelSynced: false };
    }
}

function syncExcelFromLedger() {
    const entries = loadLedger();
    if (entries.length === 0 && !fs.existsSync(FILE_PATH) && !excelSyncPending) {
        return true;
    }
    return tryWriteExcel(entries);
}

function flushExcel() {
    return withExcelLock(() => {
        if (!excelSyncPending) {
            return true;
        }
        return syncExcelFromLedger();
    });
}

function startExcelFlushTimer() {
    if (excelFlushTimer) {
        return;
    }

    const retryMs = Number.parseInt(process.env.EXCEL_RETRY_MS || "5000", 10);
    if (!Number.isFinite(retryMs) || retryMs <= 0) {
        return;
    }

    excelFlushTimer = setInterval(() => {
        flushExcel().catch((error) => {
            console.error(
                `Failed to update Excel file at ${FILE_PATH}.`,
                error,
            );
        });
    }, retryMs);

    if (typeof excelFlushTimer.unref === "function") {
        excelFlushTimer.unref();
    }
}

function stopExcelFlushTimer() {
    if (!excelFlushTimer) {
        return;
    }
    clearInterval(excelFlushTimer);
    excelFlushTimer = null;
}

app.post("/save", async (req, res) => {
    const {
        boxNumber,
        product,
        operatorName,
        destination,
        netWeight,
        chipType,
        missing,
    } = validatePayload(req.body);

    if (missing.length > 0) {
        return res.status(400).json({
            error: "Missing required fields.",
            fields: missing,
        });
    }

    const { date, time, recorded } = formatRecordedStamp();

    const row = [
        boxNumber,
        product,
        operatorName,
        destination,
        date,
        time,
        netWeight,
    ];

    try {
        const result = await withExcelLock(() => {
            if (
                shouldEnforceUniqueBoxNumber(boxNumber, chipType) &&
                isBoxNumberConsumed(boxNumber)
            ) {
                const error = new Error(DUPLICATE_BOX_MESSAGE);
                error.code = "DUPLICATE_BOX";
                throw error;
            }

            return saveRow(row);
        });
        return res.json({
            success: true,
            excelSynced: result.excelSynced !== false,
            date,
            time,
            savedAt: recorded.toISOString(),
        });
    } catch (error) {
        if (error.code === "DUPLICATE_BOX") {
            return res.status(409).json({
                error: DUPLICATE_BOX_MESSAGE,
            });
        }

        console.error(
            `Failed to save data at ${getLedgerFilePath()}.`,
            error,
        );
        return res.status(500).json({
            error: "Unable to save data.",
        });
    }
});

app.use((req, res) => {
    res.status(404).json({ error: "Not found." });
});

function logStartup(server) {
    const address = server.address();
    const boundPort =
        address && typeof address === "object" ? address.port : PORT;
    const lanAddresses = getLanAddresses();
    console.log("Nylene Consumption Sheet intranet server");
    console.log(`Listening on ${HOST}:${boundPort}`);
    console.log(`Local URL:     http://127.0.0.1:${boundPort}`);
    if (lanAddresses.length > 0) {
        for (const lanAddress of lanAddresses) {
            console.log(`Intranet URL:  http://${lanAddress}:${boundPort}`);
        }
    } else {
        console.log(
            "No LAN address detected. Other stations can use this computer's hostname or IP.",
        );
    }
    console.log(`Excel file:    ${FILE_PATH}`);
    console.log(`Ledger file:   ${getLedgerFilePath()}`);
    console.log(
        ALLOW_PUBLIC
            ? "Access policy: public IPs allowed (ALLOW_PUBLIC=true)"
            : "Access policy: company intranet / private network only",
    );
}

function startServer() {
    const server = app.listen(PORT, HOST, () => {
        logStartup(server);
        startExcelFlushTimer();
    });
    server.on("close", stopExcelFlushTimer);
    return server;
}

if (require.main === module) {
    startServer();
}

module.exports = {
    app,
    startServer,
    isAllowedClientIp,
    isFileLockError,
    normalizeIp,
    getExcelFilePath,
    getLedgerFilePath,
    flushExcel,
    shiftDisplayTime,
    DISPLAY_TIME_OFFSET_HOURS,
    DUPLICATE_BOX_MESSAGE,
    shouldEnforceUniqueBoxNumber,
};
