const express = require("express");
const cors = require("cors");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

// Express API that accepts form submissions and writes rows to Excel.
const app = express();
const PORT = process.env.PORT || 3000;
// Absolute Excel path used by the save endpoint (configure per environment).
const FILE_PATH =
    "/Users/biggie/Desktop/nylene-conumption-data/consumption-sheet.xlsx";
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

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function getTrimmedString(value) {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeHeaderValue(value) {
    return getTrimmedString(value).toLowerCase();
}

function headersMatch(expected, actual) {
    if (!Array.isArray(actual) || actual.length < expected.length) {
        return false;
    }

    return expected.every(
        (header, index) =>
            normalizeHeaderValue(actual[index]) ===
            normalizeHeaderValue(header),
    );
}

// Normalize and validate the incoming payload for required fields.
function validatePayload(body) {
    const boxNumber = getTrimmedString(body?.boxNumber);
    const product = getTrimmedString(body?.product);
    const operatorName = getTrimmedString(body?.operatorName);
    const destination = getTrimmedString(body?.destination);
    const netWeight = getTrimmedString(body?.netWeight);

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
        // if (!headerRow || headerRow.length < HEADERS.length) {
        if (!headersMatch(HEADERS, headerRow)) {
            XLSX.utils.sheet_add_aoa(worksheet, [HEADERS], { origin: "A1" });
        }
    }

    return worksheet;
}

app.post("/save", (req, res) => {
    // Validate the request and return field-level errors if needed.
    const {
        boxNumber,
        product,
        operatorName,
        destination,
        netWeight,
        missing,
    } = validatePayload(req.body);

    if (missing.length > 0) {
        return res.status(400).json({
            error: "Missing required fields.",
            fields: missing,
        });
    }

    // Capture date and time separately to match the Excel columns.
    const now = new Date();
    const date = now.toLocaleDateString("en-US");
    const time = now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
    });

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
        // Append a new row to the sheet and write the file to disk.
        ensureDirectoryExists(FILE_PATH);
        const workbook = loadWorkbook(FILE_PATH);
        const worksheet = getOrCreateWorksheet(workbook);

        XLSX.utils.sheet_add_aoa(worksheet, [row], { origin: -1 });
        XLSX.writeFile(workbook, FILE_PATH);

        return res.json({ success: true });
    } catch (error) {
        console.error("Failed to save data to Excel file.", error);
        return res.status(500).json({ error: "Unable to save data." });
    }
});

app.listen(PORT, () => {
    // Simple startup log for local development.
    console.log(`Server running at http://localhost:${PORT}`);
});
