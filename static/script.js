// État de l'application
let infoVideoActuelle = null;
let idTelechargementActuel = null;

// Éléments du DOM
const formulaireUrl = document.getElementById('urlForm');
const inputUrlVideo = document.getElementById('videoUrl');
const messageErreur = document.getElementById('errorMessage');
const etatChargement = document.getElementById('loadingState');
const sectionInfoVideo = document.getElementById('videoInfoSection');
const progressionTelechargement = document.getElementById('downloadProgress');
const btnSitesSupportes = document.getElementById('supportedSitesBtn');

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', function() {
    initialiserEcouteursEvenements();
    chargerSitesSupportes();
});

function initialiserEcouteursEvenements() {
    // Soumission du formulaire URL
    formulaireUrl.addEventListener('submit', gererSoumissionUrl);
    
    // Bouton sites supportés
    btnSitesSupportes.addEventListener('click', function() {
        const modal = new bootstrap.Modal(document.getElementById('supportedSitesModal'));
        modal.show();
    });
    
    // Clics sur les boutons de téléchargement (délégation d'événements)
    document.addEventListener('click', function(e) {
        if (e.target.closest('.download-btn')) {
            const btn = e.target.closest('.download-btn');
            const idFormat = btn.dataset.formatId;
            const qualite = btn.dataset.quality;
            gererTelechargement(idFormat, qualite);
        }
    });
}

async function gererSoumissionUrl(e) {
    e.preventDefault();
    
    const url = inputUrlVideo.value.trim();
    if (!url) {
        afficherErreur('Veuillez entrer une URL valide');
        return;
    }
    
    // Validation du format URL
    if (!estUrlValide(url)) {
        afficherErreur('Veuillez entrer une URL valide (ex : https://www.youtube.com/watch?v=...)');
        return;
    }
    
    await obtenirInfoVideo(url);
}

function estUrlValide(chaine) {
    try {
        const url = new URL(chaine);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

async function obtenirInfoVideo(url) {
    try {
        afficherChargement(true);
        cacherErreur();
        cacherInfoVideo();
        
        const reponse = await fetch('/get_info', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: url })
        });
        
        const donnees = await reponse.json();
        
        if (!reponse.ok) {
            throw new Error(donnees.error || 'Échec de la récupération des informations vidéo');
        }
        
        infoVideoActuelle = donnees;
        afficherInfoVideo(donnees);
        
    } catch (erreur) {
        console.error('Erreur lors de la récupération des infos vidéo :', erreur);
        afficherErreur(erreur.message || 'Échec de la récupération des informations vidéo. Veuillez vérifier l\'URL et réessayer.');
    } finally {
        afficherChargement(false);
    }
}

function afficherInfoVideo(info) {
    // Met à jour la miniature vidéo
    const miniature = document.getElementById('videoThumbnail');
    if (info.thumbnail) {
        miniature.src = info.thumbnail;
        miniature.alt = info.title;
    }
    
    // Met à jour le badge plateforme
    const badgePlateforme = document.getElementById('platformBadge');
    badgePlateforme.textContent = info.platform || 'Inconnu';
    
    // Met à jour les détails vidéo
    document.getElementById('videoTitle').textContent = info.title || 'Titre inconnu';
    document.getElementById('videoUploader').textContent = info.uploader || 'Inconnu';
    document.getElementById('videoDuration').textContent = formaterDuree(info.duration);
    
    // Remplit les formats vidéo
    remplirFormatsVideo(info.formats || []);
    
    // Affiche la section info vidéo
    afficherInfoVideoSection();
}

function remplirFormatsVideo(formats) {
    const conteneurFormats = document.getElementById('videoFormats');
    conteneurFormats.innerHTML = '';
    
    if (formats.length === 0) {
        conteneurFormats.innerHTML = `
            <div class="alert alert-info">
                <i data-feather="info"></i>
                Aucun format spécifique disponible. Vous pouvez toujours télécharger la meilleure qualité vidéo.
            </div>
            <div class="format-option">
                <div class="format-info">
                    <span class="format-title">Meilleure qualité</span>
                    <span class="format-quality">Sélection automatique</span>
                </div>
                <button class="btn btn-success download-btn" data-quality="best">
                    <i data-feather="download"></i>
                    Télécharger la vidéo
                </button>
            </div>
        `;
    } else {
        // Filtrer et trier les formats
        const formatsVideo = formats
            .filter(f => f.vcodec && f.vcodec !== 'none')
            .sort((a, b) => {
                const aHauteur = parseInt(a.quality) || 0;
                const bHauteur = parseInt(b.quality) || 0;
                return bHauteur - aHauteur;
            });
        
        // Ajouter l'option meilleure qualité en premier
        conteneurFormats.innerHTML = `
            <div class="format-option">
                <div class="format-info">
                    <span class="format-title">Meilleure qualité</span>
                    <span class="format-quality">Sélection automatique</span>
                </div>
                <button class="btn btn-success download-btn" data-quality="best">
                    <i data-feather="download"></i>
                    Télécharger la meilleure qualité
                </button>
            </div>
        `;
        
        // Ajouter les options de formats spécifiques
        formatsVideo.slice(0, 10).forEach(format => {
            const elementFormat = document.createElement('div');
            elementFormat.className = 'format-option';
            
            const qualite = format.quality || 'Inconnu';
            const ext = format.ext || 'mp4';
            const tailleFichier = format.filesize ? formaterTailleFichier(format.filesize) : '';
            
            elementFormat.innerHTML = `
                <div class="format-info">
                    <span class="format-title">${qualite} (${ext.toUpperCase()})</span>
                    <span class="format-quality">${tailleFichier}</span>
                </div>
                <button class="btn btn-success download-btn" data-format-id="${format.format_id}">
                    <i data-feather="download"></i>
                    Télécharger
                </button>
            `;
            
            conteneurFormats.appendChild(elementFormat);
        });
    }
    
    // Réinitialiser les icônes feather
    feather.replace();
}

async function gererTelechargement(idFormat, qualite) {
    if (!infoVideoActuelle) {
        afficherErreur('Veuillez d\'abord sélectionner une vidéo');
        return;
    }
    
    try {
        cacherErreur();
        afficherProgressionTelechargement();
        
        const reponse = await fetch('/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: inputUrlVideo.value.trim(),
                format_id: idFormat,
                quality: qualite || 'best'
            })
        });
        
        const donnees = await reponse.json();
        
        if (!reponse.ok) {
            throw new Error(donnees.error || 'Échec du démarrage du téléchargement');
        }
        
        idTelechargementActuel = donnees.download_id;
        surveillerProgressionTelechargement();
        
    } catch (erreur) {
        console.error('Erreur de téléchargement :', erreur);
        afficherErreur(erreur.message || 'Échec du démarrage du téléchargement');
        cacherProgressionTelechargement();
    }
}

function surveillerProgressionTelechargement() {
    if (!idTelechargementActuel) return;
    
    const verifier = async () => {
        try {
            const reponse = await fetch(`/progress/${idTelechargementActuel}`);
            const progression = await reponse.json();
            
            mettreAJourAffichageProgression(progression);
            
            if (progression.status === 'finished') {
                setTimeout(() => {
                    cacherProgressionTelechargement();
                    idTelechargementActuel = null;
                }, 3000);
            } else if (progression.status === 'error') {
                afficherErreur(progression.message || 'Erreur lors du téléchargement');
                cacherProgressionTelechargement();
                idTelechargementActuel = null;
            } else {
                setTimeout(verifier, 1000);
            }
        } catch (erreur) {
            console.error('Erreur lors de la vérification de la progression :', erreur);
            setTimeout(verifier, 3000);
        }
    };
    
    verifier();
}

function mettreAJourAffichageProgression(progression) {
    if (!progressionTelechargement) return;
    
    const pourcentage = progression.percent || 0;
    progressionTelechargement.style.width = `${pourcentage}%`;
    progressionTelechargement.textContent = `${pourcentage}%`;
}

function afficherErreur(message) {
    messageErreur.textContent = message;
    messageErreur.style.display = 'block';
}

function cacherErreur() {
    messageErreur.textContent = '';
    messageErreur.style.display = 'none';
}

function afficherChargement(afficher) {
    etatChargement.style.display = afficher ? 'block' : 'none';
}

function afficherInfoVideoSection() {
    sectionInfoVideo.style.display = 'block';
}

function cacherInfoVideo() {
    sectionInfoVideo.style.display = 'none';
}

function afficherProgressionTelechargement() {
    const conteneurProgression = document.getElementById('downloadProgressContainer');
    if (conteneurProgression) {
        conteneurProgression.style.display = 'block';
        progressionTelechargement.style.width = '0%';
        progressionTelechargement.textContent = '0%';
    }
}

function cacherProgressionTelechargement() {
    const conteneurProgression = document.getElementById('downloadProgressContainer');
    if (conteneurProgression) {
        conteneurProgression.style.display = 'none';
        progressionTelechargement.style.width = '0%';
        progressionTelechargement.textContent = '';
    }
}

function formaterDuree(secondes) {
    if (!secondes) return '00:00';
    const min = Math.floor(secondes / 60);
    const sec = secondes % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function formaterTailleFichier(octets) {
    if (!octets) return '';
    const tailles = ['octets', 'Ko', 'Mo', 'Go', 'To'];
    let i = 0;
    let taille = octets;
    while (taille >= 1024 && i < tailles.length - 1) {
        taille /= 1024;
        i++;
    }
    return `${taille.toFixed(2)} ${tailles[i]}`;
}

async function chargerSitesSupportes() {
    try {
        const reponse = await fetch('/supported_sites');
        const donnees = await reponse.json();
        const listeSites = document.getElementById('supportedSitesList');
        listeSites.innerHTML = '';
        donnees.sites.forEach(site => {
            const li = document.createElement('li');
            li.textContent = site;
            listeSites.appendChild(li);
        });
    } catch (erreur) {
        console.error('Erreur lors du chargement des sites supportés :', erreur);
    }
}

/* Section d'appartenance et crédits */
document.addEventListener('DOMContentLoaded', () => {
    const footer = document.getElementById('footerCredits');
    if (footer) {
        footer.innerHTML = `
            <p>Site développé par <strong>Hazard_E'isk</strong>.</p>
            <p>Source et assistance technique fournies par <em>PentestGPT</em>.</p>
            <p>IA utilisée : <em>Replit AI</em>.</p>
        `;
    }
});
