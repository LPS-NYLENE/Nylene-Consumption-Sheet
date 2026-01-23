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
    const boxInput = document.getElementById("box-number");
    const productSelect = document.getElementById("product");
    const netWeightInput = document.getElementById("net-weight");
    const operatorInput = document.getElementById("operator-name");

    if (
        !form ||
        !boxInput ||
        !productSelect ||
        !netWeightInput ||
        !operatorInput
    ) {
        return;
    }

    // Pre-fill inputs from any previously saved state.
    const stored = getStoredData();
    if (stored.boxNumber) {
        boxInput.value = stored.boxNumber;
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
        const boxNumber = normalizeText(boxInput.value);
        const product = productSelect.value;
        const netWeight = normalizeText(netWeightInput.value);
        const netWeightValue = Number.parseFloat(netWeight);
        const operatorName = normalizeText(operatorInput.value);
        const operatorParts = operatorName.split(/\s+/).filter(Boolean);

        // Validate required fields with user-friendly messages.
        if (!boxNumber) {
            setMessage(errorElement, "Please enter a box number.");
            boxInput.focus();
            return;
        }
        if (!/^[a-z0-9]+$/i.test(boxNumber)) {
            setMessage(errorElement, "Box number must be alphanumeric only.");
            boxInput.focus();
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
