
// Application state
let currentVideoInfo = null;

// DOM elements
const urlForm = document.getElementById('urlForm');
const videoUrlInput = document.getElementById('videoUrl');
const errorMessage = document.getElementById('errorMessage');
const loadingState = document.getElementById('loadingState');
const videoInfoSection = document.getElementById('videoInfoSection');
const downloadProgress = document.getElementById('downloadProgress');
const supportedSitesBtn = document.getElementById('supportedSitesBtn');

document.addEventListener('DOMContentLoaded', function () {
    initializeEventListeners();
});

function initializeEventListeners() {
    urlForm.addEventListener('submit', handleUrlSubmit);

    document.addEventListener('click', function (e) {
        if (e.target.closest('.download-btn')) {
            const btn = e.target.closest('.download-btn');
            const format = btn.dataset.format || "mp4";
            handleDownload(format);
        }
    });
}

async function handleUrlSubmit(e) {
    e.preventDefault();
    const url = videoUrlInput.value.trim();
    if (!url) return showError("Veuillez entrer une URL valide.");
    if (!isValidUrl(url)) return showError("URL non valide.");
    currentVideoInfo = { url }; // stocke l'URL brute
    showVideoInfo();
}

function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
        return false;
    }
}

function showVideoInfo() {
    document.getElementById('videoTitle').textContent = "VidÃ©o dÃ©tectÃ©e.";
    videoInfoSection.classList.remove("d-none");
}

async function handleDownload(format) {
    if (!currentVideoInfo || !currentVideoInfo.url) {
        return showError("Aucune vidÃ©o dÃ©tectÃ©e.");
    }

    showLoading(true);
    hideError();

    try {
        const response = await fetch("/api/download", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url: currentVideoInfo.url,
                format: format,
                quality: "720p"
            })
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || "Ã‰chec du tÃ©lÃ©chargement.");
        }

        showSuccess("TÃ©lÃ©chargement prÃªt. Cliquez ci-dessous pour accÃ©der au fichier.");

        const link = document.createElement("a");
        link.href = result.downloadUrl;
        link.textContent = "TÃ©lÃ©charger le fichier";
        link.className = "btn btn-success mt-3";
        link.setAttribute("download", result.filename);
        videoInfoSection.appendChild(link);

    } catch (err) {
        showError(err.message || "Erreur inconnue.");
    } finally {
        showLoading(false);
    }
}

function showError(message) {
    errorMessage.querySelector("span").textContent = message;
    errorMessage.classList.remove("d-none");
}

function hideError() {
    errorMessage.classList.add("d-none");
}

function showLoading(show) {
    loadingState.classList.toggle("d-none", !show);
}

window.addEventListener("load", function () {
    videoUrlInput.focus();
});