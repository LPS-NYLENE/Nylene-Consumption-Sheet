// Local storage key for persisting form state between pages.
const STORAGE_KEY = "productTrackingForm";

// Map <body data-page=""> values to page setup functions.
const pageInitializers = {
    form: initFormPage,
    destination: initDestinationPage,
    summary: initSummaryPage,
};

document.addEventListener("DOMContentLoaded", () => {
    // Run the initializer for the current page, if defined.
    const page = document.body?.dataset?.page;
    const init = pageInitializers[page];
    if (init) {
        init();
    }
});

function getStoredData() {
    // Guard against invalid or missing JSON in localStorage.
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (error) {
        return {};
    }
}

function setStoredData(data) {
    // Persist the current flow state across page reloads.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function clearStoredData() {
    // Clear the wizard state once a save completes.
    localStorage.removeItem(STORAGE_KEY);
}

function normalizeText(value) {
    return value ? value.trim() : "";
}

function getApiBaseUrl() {
    const configured = document.body?.dataset?.apiBase?.trim();
    if (configured) {
        return configured.replace(/\/+$/, "");
    }

    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    const host = window.location.hostname || "localhost";
    return `${protocol}//${host}:3000`;
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
    const chipBulkInput = document.getElementById("chip-bulk-silo");
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
        !chipBulkInput ||
        !chipPurchasedSelect ||
        !productSelect ||
        !netWeightInput ||
        !operatorInput
    ) {
        return;
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
            chipBulkInput.focus();
        } else if (showPurchased) {
            chipPurchasedSelect.focus();
        }
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
    // Even if a previous chip type exists in localStorage, require an explicit
    // selection to reveal an input field.
    setSelectedChipType("");

    chipBoxInput.addEventListener("input", () => {
        const sanitized = chipBoxInput.value.replace(/[^a-z0-9]/gi, "");
        if (chipBoxInput.value !== sanitized) {
            chipBoxInput.value = sanitized;
        }
    });

    chipBulkInput.addEventListener("input", () => {
        const sanitized = chipBulkInput.value.replace(/\d/g, "");
        if (chipBulkInput.value !== sanitized) {
            chipBulkInput.value = sanitized;
        }
    });

    if (stored.chipBoxNumber) {
        chipBoxInput.value = stored.chipBoxNumber;
    }
    if (stored.chipBulkSilo) {
        chipBulkInput.value = stored.chipBulkSilo;
    }
    if (stored.chipPurchased) {
        chipPurchasedSelect.value = stored.chipPurchased;
    }
    if (stored.product) {
        productSelect.value = stored.product;
    }
    if (stored.netWeight !== undefined && stored.netWeight !== null) {
        netWeightInput.value = stored.netWeight;
    }
    if (stored.operatorName) {
        operatorInput.value = stored.operatorName;
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        setMessage(errorElement, "");

        // Normalize inputs before validation and storage.
        const chipType = getSelectedChipType();
        const chipBoxNumber = normalizeText(chipBoxInput.value);
        const chipBulkSilo = normalizeText(chipBulkInput.value);
        const chipPurchased = chipPurchasedSelect.value;
        const product = productSelect.value;
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
                setMessage(errorElement, "Please enter a bulk/silo value.");
                chipBulkInput.focus();
                return;
            }
            if (/\d/.test(chipBulkSilo)) {
                setMessage(
                    errorElement,
                    "Bulk/Silo must not contain numbers.",
                );
                chipBulkInput.focus();
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
        } else {
            setMessage(
                errorElement,
                "Please select what type of chip this is.",
            );
            chipTypeButtons[0].focus();
            return;
        }

        if (!product) {
            setMessage(errorElement, "Please select a product.");
            productSelect.focus();
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
        if (operatorParts.length < 2) {
            setMessage(errorElement, "Please enter first and last name.");
            operatorInput.focus();
            return;
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

    // Populate the summary fields from localStorage.
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
        : new Date();
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
                    }),
                });

                if (!response.ok) {
                    throw new Error("Save request failed.");
                }

                window.alert("Saved to Excel.");
                // Keep the button disabled because a redirect is scheduled.
                shouldUnlock = false;

                const savedAt = new Date();
                setStoredData({
                    ...stored,
                    savedAt: savedAt.toISOString(),
                });
                if (dateTime) {
                    dateTime.textContent = formatDateTime(savedAt);
                }
                setMessage(
                    message,
                    `Saved at ${formatDateTime(
                        savedAt,
                    )}. Redirecting to the first page in 3 seconds.`,
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
                window.alert("Save failed. Please try again.");
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
