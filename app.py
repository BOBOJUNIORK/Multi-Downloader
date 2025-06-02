import os
import logging
import json
import threading
from urllib.parse import urlparse
from flask import Flask, render_template, request, jsonify, send_file
import yt_dlp
import uuid

# Configuration du logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "cle-secrete-dev-a-changer")

# Dossier pour stocker les téléchargements
DOSSIER_TELECHARGEMENTS = os.path.join(os.getcwd(), 'downloads')
os.makedirs(DOSSIER_TELECHARGEMENTS, exist_ok=True)

# Variable globale pour stocker la progression des téléchargements
progression_telechargement = {}

class CrochetProgression:
    def __init__(self, id_telechargement):
        self.id_telechargement = id_telechargement
    
    def __call__(self, d):
        if d['status'] == 'downloading':
            try:
                pourcentage = d.get('_percent_str', '0%').replace('%', '')
                vitesse = d.get('_speed_str', 'N/A')
                eta = d.get('_eta_str', 'N/A')
                
                progression_telechargement[self.id_telechargement] = {
                    'status': 'en cours',
                    'percent': float(pourcentage) if pourcentage != 'N/A' else 0,
                    'speed': vitesse,
                    'eta': eta,
                    'filename': d.get('filename', 'Inconnu')
                }
            except (ValueError, TypeError):
                progression_telechargement[self.id_telechargement] = {
                    'status': 'en cours',
                    'percent': 0,
                    'speed': 'N/A',
                    'eta': 'N/A',
                    'filename': 'Inconnu'
                }
        elif d['status'] == 'finished':
            progression_telechargement[self.id_telechargement] = {
                'status': 'terminé',
                'percent': 100,
                'filename': d.get('filename', 'Inconnu'),
                'filepath': d.get('filename', '')
            }

def obtenir_info_video(url):
    """Récupérer les informations de la vidéo sans la télécharger"""
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            formats = []
            if 'formats' in info:
                for f in info['formats']:
                    if f.get('vcodec') != 'none' or f.get('acodec') != 'none':
                        info_format = {
                            'format_id': f.get('format_id'),
                            'ext': f.get('ext'),
                            'quality': f.get('format_note', f.get('quality', 'Inconnu')),
                            'filesize': f.get('filesize'),
                            'vcodec': f.get('vcodec'),
                            'acodec': f.get('acodec')
                        }
                        formats.append(info_format)
            
            return {
                'title': info.get('title', 'Inconnu'),
                'thumbnail': info.get('thumbnail'),
                'duration': info.get('duration'),
                'uploader': info.get('uploader'),
                'formats': formats,
                'platform': info.get('extractor_key', 'Inconnu')
            }
    except Exception as e:
        logger.error(f"Erreur lors de la récupération des infos vidéo : {str(e)}")
        return None

def telecharger_video(url, format_id, qualite, id_telechargement):
    """Télécharger la vidéo dans un thread séparé"""
    try:
        ydl_opts = {
            'outtmpl': os.path.join(DOSSIER_TELECHARGEMENTS, '%(title)s.%(ext)s'),
            'progress_hooks': [CrochetProgression(id_telechargement)],
            # Ajout du chemin ffmpeg pour éviter l'erreur audio
            'ffmpeg_location': '/usr/bin/ffmpeg',
        }
        
        if qualite == 'audio':
            ydl_opts['format'] = 'bestaudio/best'
            ydl_opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }]
        elif format_id:
            ydl_opts['format'] = format_id
        else:
            ydl_opts['format'] = 'best'
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
            
    except Exception as e:
        logger.error(f"Erreur lors du téléchargement : {str(e)}")
        progression_telechargement[id_telechargement] = {
            'status': 'erreur',
            'error': str(e)
        }

@app.route('/')
def accueil():
    # On peut passer des variables à la page pour afficher la déclaration d'appartenance
    return render_template('index.html', proprietaire="Hazard_E'isk", source="PentestGPT IA via Replit")

@app.route('/get_info', methods=['POST'])
def get_info():
    data = request.get_json()
    url = data.get('url', '').strip()
    
    if not url:
        return jsonify({'error': 'Veuillez fournir une URL valide'}), 400
    
    try:
        parsed_url = urlparse(url)
        if not parsed_url.scheme or not parsed_url.netloc:
            return jsonify({'error': 'Veuillez fournir une URL valide'}), 400
    except Exception:
        return jsonify({'error': 'Format d\'URL invalide'}), 400
    
    info = obtenir_info_video(url)
    if not info:
        return jsonify({'error': 'Impossible d\'extraire les informations de la vidéo. Veuillez vérifier l\'URL et réessayer.'}), 400
    
    return jsonify(info)

@app.route('/download', methods=['POST'])
def download():
    data = request.get_json()
    url = data.get('url', '').strip()
    format_id = data.get('format_id')
    qualite = data.get('quality', 'best')
    
    if not url:
        return jsonify({'error': 'Veuillez fournir une URL valide'}), 400
    
    id_telechargement = str(uuid.uuid4())
    
    progression_telechargement[id_telechargement] = {
        'status': 'démarrage',
        'percent': 0
    }
    
    thread = threading.Thread(
        target=telecharger_video,
        args=(url, format_id, qualite, id_telechargement)
    )
    thread.daemon = True
    thread.start()
    
    return jsonify({'download_id': id_telechargement})

@app.route('/progress/<id_telechargement>')
def get_progress(id_telechargement):
    prog = progression_telechargement.get(id_telechargement, {'status': 'non_trouve'})
    return jsonify(prog)

@app.route('/supported_sites')
def supported_sites():
    try:
        extracteurs = yt_dlp.extractor.list_extractors()
        sites = []
        
        sites_populaires = [
            'YouTube', 'Facebook', 'Twitter', 'Instagram', 'TikTok',
            'Vimeo', 'Dailymotion', 'Twitch', 'Pinterest', 'Reddit'
        ]
        
        for ext in extracteurs[:50]:
            nom = ext.IE_NAME
            if any(site.lower() in nom.lower() for site in sites_populaires):
                sites.append(nom)
        
        return jsonify({'sites': sites})
    except Exception as e:
        logger.error(f"Erreur lors de la récupération des sites supportés : {str(e)}")
        return jsonify({'sites': sites_populaires})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
