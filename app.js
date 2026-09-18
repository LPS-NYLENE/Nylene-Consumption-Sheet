// Session storage key for persisting in-progress form state on this station.
const STORAGE_KEY = "productTrackingForm";
const DISPLAY_TIME_OFFSET_HOURS = 3;
const DUPLICATE_BOX_MESSAGE =
    "The box with this Box number has been consumed try another box";

// Map <body data-page=""> values to page setup functions.
const pageInitializers = {
    form: initFormPage,
    destination: initDestinationPage,
    summary: initSummaryPage,
    records: initRecordsPage,
};

document.addEventListener("DOMContentLoaded", () => {
    markActiveNav();
    // Run the initializer for the current page, if defined.
    const page = document.body?.dataset?.page;
    const init = pageInitializers[page];
    if (init) {
        init();
    }
});

function getStorage() {
    try {
        return window.sessionStorage;
    } catch (error) {
        return null;
    }
}

function getStoredData() {
    // Guard against invalid or missing JSON in sessionStorage.
    try {
        const storage = getStorage();
        return JSON.parse(storage?.getItem(STORAGE_KEY) || "null") || {};
    } catch (error) {
        return {};
    }
}

function setStoredData(data) {
    // Persist the current flow state across page reloads on this station.
    const storage = getStorage();
    if (storage) {
        storage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
}

function clearStoredData() {
    // Clear the wizard state once a save completes.
    const storage = getStorage();
    if (storage) {
        storage.removeItem(STORAGE_KEY);
    }
}

function markActiveNav() {
    const page = document.body?.dataset?.page;
    document.querySelectorAll("[data-nav]").forEach((link) => {
        if (link.dataset.nav === page) {
            link.setAttribute("aria-current", "page");
        }
    });
}

function normalizeText(value) {
    return value ? value.trim() : "";
}

const NON_EDITABLE_BOX_CHIP_TYPES = new Set(["bulk", "silo", "purchased"]);
const NON_EDITABLE_BOX_IDENTIFIERS = new Set(
    [
        "A-Bulk",
        "B-Bulk",
        "C-Bulk",
        "Other",
        "Silo",
        "BASF",
        "AdvanSix",
        "MOHAWK",
        "GeneralPurchasedChip",
    ].map((value) => value.toLowerCase()),
);

function isBoxNumberEditable(entry) {
    const type = normalizeText(entry?.chipType).toLowerCase();
    if (NON_EDITABLE_BOX_CHIP_TYPES.has(type)) {
        return false;
    }

    return !NON_EDITABLE_BOX_IDENTIFIERS.has(
        normalizeText(entry?.boxNumber).toLowerCase(),
    );
}

function chipTypeLabel(entry) {
    const type = normalizeText(entry?.chipType).toLowerCase();
    if (type === "purchased") {
        return "Purchased Chip";
    }
    if (type === "bulk" || type === "silo") {
        return "Bulk/Silo";
    }

    const boxKey = normalizeText(entry?.boxNumber).toLowerCase();
    if (
        boxKey === "basf" ||
        boxKey === "advansix" ||
        boxKey === "mohawk" ||
        boxKey === "generalpurchasedchip"
    ) {
        return "Purchased Chip";
    }
    if (NON_EDITABLE_BOX_IDENTIFIERS.has(boxKey)) {
        return "Bulk/Silo";
    }

    return "Box Number";
}

function getApiBaseUrl() {
    const configured = document.body?.dataset?.apiBase?.trim();
    if (configured) {
        return configured.replace(/\/+$/, "");
    }

    // Same-origin when the intranet server serves the pages.
    if (
        window.location.protocol === "http:" ||
        window.location.protocol === "https:"
    ) {
        return "";
    }

    return "http://127.0.0.1:3000";
}

function setMessage(element, message) {
    // Avoid errors if a message element is missing from the page.
    if (element) {
        element.textContent = message;
    }
}

function formatDateTime(date) {
    // Keep timestamp formatting consistent across the summary page.
    return date.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function shiftDisplayTime(date, hours = DISPLAY_TIME_OFFSET_HOURS) {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

async function isBoxNumberAlreadyConsumed(boxNumber) {
    const key = normalizeText(boxNumber).toLowerCase();
    if (!key) {
        return false;
    }

    try {
        const response = await fetch(`${getApiBaseUrl()}/api/entries`);
        if (!response.ok) {
            return false;
        }

        const payload = await response.json().catch(() => ({}));
        const entries = Array.isArray(payload.entries) ? payload.entries : [];
        return entries.some(
            (entry) => normalizeText(entry.boxNumber).toLowerCase() === key,
        );
    } catch (error) {
        return false;
    }
}

function initFormPage() {
    const form = document.getElementById("box-form");
    const errorElement = document.getElementById("form-error");
    const chipTypeButtons = Array.from(
        document.querySelectorAll("[data-chip-type]"),
    );
    const chipBoxField = document.getElementById("chip-box-field");
    const chipBulkField = document.getElementById("chip-bulk-field");
    const chipPurchasedField = document.getElementById("chip-purchased-field");
    const chipBoxInput = document.getElementById("chip-box-number");
    const chipBulkSelect = document.getElementById("chip-bulk-silo");
    const chipPurchasedSelect = document.getElementById("chip-purchased");
    const productSelect = document.getElementById("product");
    const netWeightInput = document.getElementById("net-weight");
    const operatorInput = document.getElementById("operator-name");

    if (
        !form ||
        chipTypeButtons.length === 0 ||
        !chipBoxField ||
        !chipBulkField ||
        !chipPurchasedField ||
        !chipBoxInput ||
        !chipBulkSelect ||
        !chipPurchasedSelect ||
        !productSelect ||
        !netWeightInput ||
        !operatorInput
    ) {
        return;
    }

    const PURCHASED_PRODUCT_VALUE = "PURCHASED";
    let lastManualProductSelection = "";

    function ensureProductOption(select, value, label) {
        const existing = Array.from(select.options).find(
            (option) => option.value === value,
        );
        if (existing) {
            return existing;
        }

        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.append(option);
        return option;
    }

    const purchasedProductOption = ensureProductOption(
        productSelect,
        PURCHASED_PRODUCT_VALUE,
        "Purchased",
    );
    purchasedProductOption.hidden = true;

    function syncProductSelectForChipType(type) {
        const isPurchasedChip = type === "purchased";

        if (isPurchasedChip) {
            if (productSelect.value && productSelect.value !== PURCHASED_PRODUCT_VALUE) {
                lastManualProductSelection = productSelect.value;
            }

            purchasedProductOption.hidden = false;
            productSelect.value = PURCHASED_PRODUCT_VALUE;
            productSelect.disabled = true;
            return;
        }

        productSelect.disabled = false;
        purchasedProductOption.hidden = true;

        if (productSelect.value === PURCHASED_PRODUCT_VALUE) {
            productSelect.value = lastManualProductSelection || "";
        }
    }

    function getSelectedChipType() {
        const selected = chipTypeButtons.find(
            (button) => button.getAttribute("aria-pressed") === "true",
        );
        return selected?.dataset?.chipType || "";
    }

    function setSelectedChipType(type) {
        chipTypeButtons.forEach((button) => {
            const isSelected = button.dataset.chipType === type;
            button.setAttribute("aria-pressed", isSelected ? "true" : "false");
        });

        const showBox = type === "box";
        const showBulk = type === "bulk";
        const showPurchased = type === "purchased";

        chipBoxField.hidden = !showBox;
        chipBulkField.hidden = !showBulk;
        chipPurchasedField.hidden = !showPurchased;

        if (showBox) {
            chipBoxInput.focus();
        } else if (showBulk) {
            chipBulkSelect.focus();
        } else if (showPurchased) {
            chipPurchasedSelect.focus();
        }

        syncProductSelectForChipType(type);
    }

    chipTypeButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const type = button.dataset.chipType;
            if (!type) {
                return;
            }
            setSelectedChipType(type);
            const stored = getStoredData();
            setStoredData({ ...stored, chipType: type });
        });
    });

    // Pre-fill inputs from any previously saved state.
    const stored = getStoredData();
    // Always start with just the buttons visible.
    // Even if a previous chip type exists in sessionStorage, require an explicit
    // selection to reveal an input field.
    setSelectedChipType("");

    chipBoxInput.addEventListener("input", () => {
        const sanitized = chipBoxInput.value.replace(/[^a-z0-9]/gi, "");
        if (chipBoxInput.value !== sanitized) {
            chipBoxInput.value = sanitized;
        }
    });

    // Enter after a box number should move to net weight, not submit
    // (which would otherwise focus the still-empty product select).
    chipBoxInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") {
            return;
        }

        event.preventDefault();

        if (!normalizeText(chipBoxInput.value)) {
            return;
        }

        netWeightInput.focus();
    });

    if (stored.chipBoxNumber) {
        chipBoxInput.value = stored.chipBoxNumber;
    }
    if (stored.chipBulkSilo) {
        chipBulkSelect.value = stored.chipBulkSilo;
    }
    if (stored.chipPurchased) {
        chipPurchasedSelect.value = stored.chipPurchased;
    }
    if (stored.product) {
        productSelect.value = stored.product;
        if (stored.product !== PURCHASED_PRODUCT_VALUE) {
            lastManualProductSelection = stored.product;
        }
    }
    if (stored.netWeight !== undefined && stored.netWeight !== null) {
        netWeightInput.value = stored.netWeight;
    }
    if (stored.operatorName) {
        operatorInput.value = stored.operatorName;
    }

    productSelect.addEventListener("change", () => {
        if (!productSelect.disabled && productSelect.value) {
            lastManualProductSelection = productSelect.value;
        }
    });

    // Start with product enabled and "Purchased" option hidden until selected.
    syncProductSelectForChipType("");

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        setMessage(errorElement, "");

        // Normalize inputs before validation and storage.
        const chipType = getSelectedChipType();
        const chipBoxNumber = normalizeText(chipBoxInput.value);
        const chipBulkSilo = chipBulkSelect.value;
        const chipPurchased = chipPurchasedSelect.value;
        let product = productSelect.value;
        const netWeight = normalizeText(netWeightInput.value);
        const netWeightValue = Number.parseFloat(netWeight);
        const operatorName = normalizeText(operatorInput.value);
        const operatorParts = operatorName.split(/\s+/).filter(Boolean);

        // Validate required fields with user-friendly messages.
        if (!chipType) {
            setMessage(
                errorElement,
                "Please select what type of chip this is.",
            );
            chipTypeButtons[0].focus();
            return;
        }

        let boxNumber = "";
        if (chipType === "box") {
            if (!chipBoxNumber) {
                setMessage(errorElement, "Please enter a box number.");
                chipBoxInput.focus();
                return;
            }
            if (!/^[a-z0-9]+$/i.test(chipBoxNumber)) {
                setMessage(
                    errorElement,
                    "Box number must be alphanumeric only.",
                );
                chipBoxInput.focus();
                return;
            }
            boxNumber = chipBoxNumber;
        } else if (chipType === "bulk") {
            if (!chipBulkSilo) {
                setMessage(errorElement, "Please select a bulk/silo option.");
                chipBulkSelect.focus();
                return;
            }
            boxNumber = chipBulkSilo;
        } else if (chipType === "purchased") {
            if (!chipPurchased) {
                setMessage(
                    errorElement,
                    "Please select a purchased chip option.",
                );
                chipPurchasedSelect.focus();
                return;
            }
            boxNumber = chipPurchased;
            product = PURCHASED_PRODUCT_VALUE;
        } else {
            setMessage(
                errorElement,
                "Please select what type of chip this is.",
            );
            chipTypeButtons[0].focus();
            return;
        }

        if (!netWeight) {
            setMessage(errorElement, "Please enter a net weight.");
            netWeightInput.focus();
            return;
        }
        if (!Number.isFinite(netWeightValue) || netWeightValue <= 0) {
            setMessage(errorElement, "Net weight must be a positive number.");
            netWeightInput.focus();
            return;
        }
        if (!product) {
            setMessage(errorElement, "Please select a product.");
            productSelect.focus();
            return;
        }
        if (operatorParts.length < 2) {
            setMessage(errorElement, "Please enter first and last name.");
            operatorInput.focus();
            return;
        }

        if (chipType === "box") {
            const consumed = await isBoxNumberAlreadyConsumed(chipBoxNumber);
            if (consumed) {
                setMessage(errorElement, DUPLICATE_BOX_MESSAGE);
                chipBoxInput.focus();
                return;
            }
        }

        // Persist data and move to the destination step.
        setStoredData({
            ...stored,
            chipType,
            chipBoxNumber,
            chipBulkSilo,
            chipPurchased,
            boxNumber,
            product,
            netWeight,
            operatorName,
        });

        window.location.href = "destination.html";
    });
}

function initDestinationPage() {
    const form = document.getElementById("destination-form");
    const errorElement = document.getElementById("destination-error");
    const checkboxes = Array.from(
        document.querySelectorAll('input[name="destination"]'),
    );

    // Prevent reaching this page without completing the first step.
    const stored = getStoredData();
    if (
        !stored.boxNumber ||
        !stored.product ||
        !stored.netWeight ||
        !stored.operatorName
    ) {
        window.location.href = "index.html";
        return;
    }

    if (!form || checkboxes.length === 0) {
        return;
    }

    if (stored.destination) {
        const saved = checkboxes.find(
            (box) => box.value === stored.destination,
        );
        if (saved) {
            saved.checked = true;
        }
    }

    // Enforce single-selection behavior while keeping checkbox styling.
    checkboxes.forEach((box) => {
        box.addEventListener("change", () => {
            if (!box.checked) {
                return;
            }
            checkboxes.forEach((other) => {
                if (other !== box) {
                    other.checked = false;
                }
            });
        });
    });

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        setMessage(errorElement, "");

        // Require a destination before moving to the summary.
        const selected = checkboxes.find((box) => box.checked);
        if (!selected) {
            setMessage(errorElement, "Please select a chip destination.");
            return;
        }

        setStoredData({
            ...stored,
            destination: selected.value,
        });

        window.location.href = "summary.html";
    });
}

function initSummaryPage() {
    const stored = getStoredData();
    // Guard against direct navigation without completing prior steps.
    if (
        !stored.boxNumber ||
        !stored.product ||
        !stored.netWeight ||
        !stored.operatorName
    ) {
        window.location.href = "index.html";
        return;
    }
    if (!stored.destination) {
        window.location.href = "destination.html";
        return;
    }

    const boxNumber = document.getElementById("summary-box");
    const product = document.getElementById("summary-product");
    const netWeight = document.getElementById("summary-net-weight");
    const destination = document.getElementById("summary-destination");
    const operatorName = document.getElementById("summary-operator");
    const dateTime = document.getElementById("summary-datetime");
    const saveButton = document.getElementById("final-save");
    const backButton = document.getElementById("go-back");
    const message = document.getElementById("save-message");
    let redirectTimer = null;

    // Populate the summary fields from this station's in-progress entry.
    if (boxNumber) {
        boxNumber.textContent = stored.boxNumber;
    }
    if (product) {
        product.textContent = stored.product;
    }
    if (netWeight) {
        netWeight.textContent = stored.netWeight;
    }
    if (destination) {
        destination.textContent = stored.destination;
    }
    if (operatorName) {
        operatorName.textContent = stored.operatorName;
    }

    const initialTimestamp = stored.savedAt
        ? new Date(stored.savedAt)
        : shiftDisplayTime(new Date());
    if (dateTime) {
        dateTime.textContent = formatDateTime(initialTimestamp);
    }

    const apiBaseUrl = getApiBaseUrl();
    if (saveButton) {
        saveButton.addEventListener("click", async () => {
            if (saveButton.disabled) {
                return;
            }

            // Disable the button to prevent duplicate submissions.
            saveButton.disabled = true;
            setMessage(message, "");
            let shouldUnlock = true;

            try {
                // Send the collected data to the backend for Excel storage.
                const response = await fetch(`${apiBaseUrl}/save`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        boxNumber: stored.boxNumber,
                        product: stored.product,
                        netWeight: stored.netWeight,
                        operatorName: stored.operatorName,
                        destination: stored.destination,
                        chipType: stored.chipType || "",
                    }),
                });

                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(
                        payload.error || "Save failed. Please try again.",
                    );
                }

                if (payload.excelSynced === false) {
                    window.alert(
                        "Saved. Close the Excel workbook so the file can update.",
                    );
                } else {
                    window.alert("Saved to Excel.");
                }
                // Keep the button disabled because a redirect is scheduled.
                shouldUnlock = false;

                const savedAt = payload.savedAt
                    ? new Date(payload.savedAt)
                    : shiftDisplayTime(new Date());
                const savedLabel =
                    payload.date && payload.time
                        ? `${payload.date} ${payload.time}`
                        : formatDateTime(savedAt);
                setStoredData({
                    ...stored,
                    savedAt: savedAt.toISOString(),
                });
                if (dateTime) {
                    dateTime.textContent = savedLabel;
                }
                setMessage(
                    message,
                    `Saved at ${savedLabel}. Redirecting to the first page in 3 seconds.`,
                );
                // Reset any prior redirect timer before starting a new one.
                if (redirectTimer) {
                    clearTimeout(redirectTimer);
                }
                redirectTimer = window.setTimeout(() => {
                    clearStoredData();
                    window.location.href = "index.html";
                }, 3000);
            } catch (error) {
                window.alert(
                    error?.message || "Save failed. Please try again.",
                );
            } finally {
                if (shouldUnlock) {
                    saveButton.disabled = false;
                }
            }
        });
    }

    if (backButton) {
        backButton.addEventListener("click", () => {
            window.location.href = "destination.html";
        });
    }
}

const RECORDS_PAGE_SIZE = 20;

function filterRecordsBySearch(entries, query) {
    const needle = normalizeText(query).toLowerCase();
    if (!needle) {
        return entries;
    }

    return entries.filter((entry) => {
        const operatorName = String(entry.operatorName || "").toLowerCase();
        const boxNumber = String(entry.boxNumber || "").toLowerCase();
        return operatorName.includes(needle) || boxNumber.includes(needle);
    });
}

function paginateRecords(entries, page, pageSize = RECORDS_PAGE_SIZE) {
    const totalItems = entries.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const start = (currentPage - 1) * pageSize;
    return {
        items: entries.slice(start, start + pageSize),
        currentPage,
        totalPages,
        totalItems,
        startItem: totalItems === 0 ? 0 : start + 1,
        endItem: Math.min(start + pageSize, totalItems),
    };
}

function initRecordsPage() {
    const tableBody = document.getElementById("records-body");
    const emptyState = document.getElementById("records-empty");
    const errorElement = document.getElementById("records-error");
    const successElement = document.getElementById("records-success");
    const updatedElement = document.getElementById("records-updated");
    const searchInput = document.getElementById("records-search");
    const countElement = document.getElementById("records-count");
    const pagination = document.getElementById("records-pagination");
    const prevButton = document.getElementById("records-prev");
    const nextButton = document.getElementById("records-next");
    const pageLabel = document.getElementById("records-page-label");
    const passwordModal = document.getElementById("password-modal");
    const passwordForm = document.getElementById("password-form");
    const passwordInput = document.getElementById("modify-password");
    const passwordError = document.getElementById("password-error");
    const passwordCancel = document.getElementById("password-cancel");
    const editModal = document.getElementById("edit-modal");
    const editForm = document.getElementById("edit-form");
    const editRecordId = document.getElementById("edit-record-id");
    const editDate = document.getElementById("edit-date");
    const editTime = document.getElementById("edit-time");
    const editChipType = document.getElementById("edit-chip-type");
    const editDestination = document.getElementById("edit-destination");
    const editOperator = document.getElementById("edit-operator");
    const editNetWeight = document.getElementById("edit-net-weight");
    const editProduct = document.getElementById("edit-product");
    const editBoxNumber = document.getElementById("edit-box-number");
    const editBoxHint = document.getElementById("edit-box-hint");
    const editError = document.getElementById("edit-error");
    const editCancel = document.getElementById("edit-cancel");
    if (!tableBody) {
        return;
    }

    const apiBaseUrl = getApiBaseUrl();
    let pollTimer = null;
    let allEntries = [];
    let currentPage = 1;
    let entriesById = new Map();
    let pendingEntryId = "";
    let modifyToken = "";
    let modalOpen = false;

    function isModalOpen() {
        return modalOpen;
    }

    function setOverlayOpen(overlay, open) {
        if (!overlay) {
            return;
        }
        overlay.hidden = !open;
    }

    function clearPasswordInput() {
        if (passwordInput) {
            passwordInput.value = "";
        }
        setMessage(passwordError, "");
    }

    function closePasswordModal({ resetPending = true } = {}) {
        setOverlayOpen(passwordModal, false);
        clearPasswordInput();
        if (resetPending && (!editModal || editModal.hidden)) {
            modalOpen = false;
            pendingEntryId = "";
        }
    }

    function closeEditModal() {
        setOverlayOpen(editModal, false);
        setMessage(editError, "");
        modifyToken = "";
        pendingEntryId = "";
        modalOpen = false;
    }

    function openPasswordModal(entryId) {
        pendingEntryId = entryId;
        modifyToken = "";
        modalOpen = true;
        setMessage(successElement, "");
        setOverlayOpen(passwordModal, true);
        clearPasswordInput();
        passwordInput?.focus();
    }

    function ensureProductOption(select, value, label) {
        if (!select || !value) {
            return;
        }
        const existing = Array.from(select.options).find(
            (option) => option.value === value,
        );
        if (existing) {
            return;
        }
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label || value;
        select.append(option);
    }

    function fillReadonly(element, value) {
        if (element) {
            element.textContent = value || "";
        }
    }

    function openEditModal(entry) {
        if (!entry || !editForm) {
            return;
        }

        pendingEntryId = entry.id;
        modalOpen = true;
        setOverlayOpen(editModal, true);
        setMessage(editError, "");

        if (editRecordId) {
            editRecordId.value = entry.id || "";
        }
        fillReadonly(editDate, entry.date);
        fillReadonly(editTime, entry.time);
        fillReadonly(editChipType, chipTypeLabel(entry));
        fillReadonly(editDestination, entry.destination);
        fillReadonly(editOperator, entry.operatorName);

        if (editNetWeight) {
            editNetWeight.value = entry.netWeight || "";
        }
        if (editProduct) {
            ensureProductOption(editProduct, entry.product, entry.product);
            editProduct.value = entry.product || "";
        }

        const boxEditable = isBoxNumberEditable(entry);
        if (editBoxNumber) {
            editBoxNumber.value = entry.boxNumber || "";
            editBoxNumber.disabled = !boxEditable;
        }
        if (editBoxHint) {
            editBoxHint.textContent = boxEditable
                ? "Letters and numbers only"
                : "Box number cannot be changed for Bulk, Silo, or Purchased Chip records.";
        }

        (boxEditable ? editBoxNumber : editNetWeight)?.focus();
    }

    async function loadEntries() {
        if (isModalOpen()) {
            return;
        }

        try {
            const response = await fetch(`${apiBaseUrl}/api/entries`);
            if (!response.ok) {
                throw new Error("Unable to load entries.");
            }

            const payload = await response.json();
            allEntries = Array.isArray(payload.entries) ? payload.entries : [];
            renderRecords();
            setMessage(errorElement, "");
            if (updatedElement) {
                updatedElement.textContent = `Updated ${formatDateTime(new Date())}`;
            }
        } catch (error) {
            setMessage(
                errorElement,
                "Unable to load shared entries from the server.",
            );
        }
    }

    function getSearchQuery() {
        return searchInput ? searchInput.value : "";
    }

    function renderRecords() {
        const filtered = filterRecordsBySearch(allEntries, getSearchQuery());
        const page = paginateRecords(filtered, currentPage);
        currentPage = page.currentPage;

        tableBody.replaceChildren();
        entriesById = new Map();
        allEntries.forEach((entry) => {
            if (entry?.id) {
                entriesById.set(entry.id, entry);
            }
        });

        page.items.forEach((entry) => {
            const row = document.createElement("tr");
            const values = [
                entry.date,
                entry.time,
                entry.boxNumber,
                entry.product,
                entry.netWeight,
                entry.destination,
                entry.operatorName,
            ];
            values.forEach((value) => {
                const cell = document.createElement("td");
                cell.textContent = value || "";
                row.append(cell);
            });

            const actionCell = document.createElement("td");
            const modifyButton = document.createElement("button");
            modifyButton.type = "button";
            modifyButton.className = "btn secondary btn--small";
            modifyButton.textContent = "Modify";
            if (entry?.id) {
                modifyButton.dataset.modifyId = entry.id;
            } else {
                modifyButton.disabled = true;
            }
            actionCell.append(modifyButton);
            row.append(actionCell);
            tableBody.append(row);
        });

        const hasVisibleRows = page.items.length > 0;
        const hasSearch = Boolean(normalizeText(getSearchQuery()));
        tableBody.closest("table")?.toggleAttribute("hidden", !hasVisibleRows);

        if (emptyState) {
            emptyState.hidden = hasVisibleRows;
            if (!hasVisibleRows) {
                emptyState.textContent = hasSearch
                    ? "No entries match that operator name or box number."
                    : "No entries yet. Saves from any station appear here.";
            }
        }

        if (countElement) {
            if (page.totalItems === 0) {
                countElement.textContent = hasSearch
                    ? "0 matching entries"
                    : "";
            } else {
                countElement.textContent = `Showing ${page.startItem}–${page.endItem} of ${page.totalItems}`;
            }
        }

        const showPagination = page.totalItems > RECORDS_PAGE_SIZE;
        if (pagination) {
            pagination.hidden = !showPagination;
        }
        if (pageLabel) {
            pageLabel.textContent = `Page ${page.currentPage} of ${page.totalPages}`;
        }
        if (prevButton) {
            prevButton.disabled = page.currentPage <= 1;
        }
        if (nextButton) {
            nextButton.disabled = page.currentPage >= page.totalPages;
        }
    }

    if (searchInput) {
        searchInput.addEventListener("input", () => {
            currentPage = 1;
            renderRecords();
        });
    }
    if (prevButton) {
        prevButton.addEventListener("click", () => {
            currentPage -= 1;
            renderRecords();
        });
    }
    if (nextButton) {
        nextButton.addEventListener("click", () => {
            currentPage += 1;
            renderRecords();
        });
    }

    tableBody.addEventListener("click", (event) => {
        const button = event.target.closest("[data-modify-id]");
        if (!button) {
            return;
        }

        const entryId = button.dataset.modifyId;
        const entry = entriesById.get(entryId);
        if (!entryId || !entry) {
            setMessage(errorElement, "Unable to find that record.");
            return;
        }

        openPasswordModal(entryId);
    });

    passwordCancel?.addEventListener("click", () => {
        closePasswordModal();
    });

    passwordForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        setMessage(passwordError, "");

        const password = passwordInput?.value || "";
        if (!password) {
            setMessage(passwordError, "Please enter a password.");
            passwordInput?.focus();
            return;
        }

        const verifyButton = passwordForm.querySelector('button[type="submit"]');
        if (verifyButton) {
            verifyButton.disabled = true;
        }

        try {
            const response = await fetch(`${apiBaseUrl}/api/verify-modify`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ password }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setMessage(
                    passwordError,
                    payload.error || "Incorrect password.",
                );
                passwordInput?.focus();
                passwordInput?.select();
                return;
            }

            modifyToken = payload.token || "";
            const entry = entriesById.get(pendingEntryId);
            closePasswordModal({ resetPending: false });
            if (!entry || !modifyToken) {
                setMessage(errorElement, "Unable to open that record.");
                modifyToken = "";
                modalOpen = false;
                return;
            }
            openEditModal(entry);
        } catch (error) {
            setMessage(
                passwordError,
                "Unable to verify the password. Please try again.",
            );
        } finally {
            if (verifyButton) {
                verifyButton.disabled = false;
            }
        }
    });

    editCancel?.addEventListener("click", () => {
        closeEditModal();
    });

    editBoxNumber?.addEventListener("input", () => {
        if (editBoxNumber.disabled) {
            return;
        }
        const sanitized = editBoxNumber.value.replace(/[^a-z0-9]/gi, "");
        if (editBoxNumber.value !== sanitized) {
            editBoxNumber.value = sanitized;
        }
    });

    editNetWeight?.addEventListener("input", () => {
        const [whole, decimal] = editNetWeight.value.split(".");
        if (whole && whole.length > 4) {
            editNetWeight.value =
                whole.slice(0, 4) +
                (decimal !== undefined ? `.${decimal}` : "");
        }
    });

    editForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        setMessage(editError, "");

        const recordId = editRecordId?.value || pendingEntryId;
        const current = entriesById.get(recordId);
        if (!recordId || !current) {
            setMessage(editError, "Unable to find that record.");
            return;
        }
        if (!modifyToken) {
            setMessage(editError, "Please verify the password again.");
            return;
        }

        const product = editProduct?.value || "";
        const netWeight = normalizeText(editNetWeight?.value);
        const netWeightValue = Number.parseFloat(netWeight);
        const boxEditable = isBoxNumberEditable(current);
        const boxNumber = boxEditable
            ? normalizeText(editBoxNumber?.value)
            : current.boxNumber;

        if (!netWeight) {
            setMessage(editError, "Please enter a net weight.");
            editNetWeight?.focus();
            return;
        }
        if (!Number.isFinite(netWeightValue) || netWeightValue <= 0) {
            setMessage(editError, "Net weight must be a positive number.");
            editNetWeight?.focus();
            return;
        }
        if (!product) {
            setMessage(editError, "Please select a product.");
            editProduct?.focus();
            return;
        }
        if (boxEditable) {
            if (!boxNumber) {
                setMessage(editError, "Please enter a box number.");
                editBoxNumber?.focus();
                return;
            }
            if (!/^[a-z0-9]+$/i.test(boxNumber)) {
                setMessage(editError, "Box number must be alphanumeric only.");
                editBoxNumber?.focus();
                return;
            }
        }

        const saveButton = editForm.querySelector('button[type="submit"]');
        if (saveButton) {
            saveButton.disabled = true;
        }

        try {
            const response = await fetch(
                `${apiBaseUrl}/api/entries/${encodeURIComponent(recordId)}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        token: modifyToken,
                        product,
                        netWeight,
                        boxNumber,
                    }),
                },
            );
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(
                    payload.error || "Save failed. Please try again.",
                );
            }

            closeEditModal();
            setMessage(successElement, "Record updated successfully.");
            await loadEntries();
        } catch (error) {
            setMessage(
                editError,
                error?.message || "Save failed. Please try again.",
            );
        } finally {
            if (saveButton) {
                saveButton.disabled = false;
            }
        }
    });

    function handleOverlayClick(event, closeFn) {
        if (event.target === event.currentTarget) {
            closeFn();
        }
    }

    passwordModal?.addEventListener("click", (event) => {
        handleOverlayClick(event, closePasswordModal);
    });
    editModal?.addEventListener("click", (event) => {
        handleOverlayClick(event, closeEditModal);
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") {
            return;
        }
        if (editModal && !editModal.hidden) {
            closeEditModal();
            return;
        }
        if (passwordModal && !passwordModal.hidden) {
            closePasswordModal();
        }
    });

    loadEntries();
    pollTimer = window.setInterval(loadEntries, 4000);
    window.addEventListener("pagehide", () => {
        if (pollTimer) {
            window.clearInterval(pollTimer);
        }
    });
}
