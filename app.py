import os
import logging
import threading
from urllib.parse import urlparse
from flask import Flask, render_template, request, jsonify, send_file
import yt_dlp
import uuid

# Configuration du logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "dev-secret-key-change-in-production")

# Configuration des dossiers
DOWNLOADS_DIR = os.path.join(os.getcwd(), 'downloads')
os.makedirs(DOWNLOADS_DIR, exist_ok=True)  # Crée le dossier s'il n'existe pas

# Stockage de la progression
download_progress = {}

class ProgressHook:
    def __init__(self, download_id):
        self.download_id = download_id

    def __call__(self, d):
        if d['status'] == 'downloading':
            download_progress[self.download_id] = {
                'status': 'downloading',
                'percent': float(d.get('_percent_str', '0%').replace('%', '') or 0),
                'speed': d.get('_speed_str', 'N/A'),
                'eta': d.get('_eta_str', 'N/A'),
                'filename': d.get('filename', '')
            }
        elif d['status'] == 'finished':
            download_progress[self.download_id] = {
                'status': 'finished',
                'percent': 100,
                'filepath': d['filename'],  # Chemin complet du fichier
                'filename': os.path.basename(d['filename'])  # Nom du fichier seul
            }

def get_video_info(url):
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            formats = []
            if 'formats' in info:
                for f in info['formats']:
                    if f.get('vcodec') != 'none' or f.get('acodec') != 'none':
                        formats.append({
                            'format_id': f.get('format_id'),
                            'ext': f.get('ext'),
                            'quality': f.get('format_note', f.get('quality', 'Unknown')),
                            'filesize': f.get('filesize'),
                            'vcodec': f.get('vcodec'),
                            'acodec': f.get('acodec')
                        })
            
            return {
                'title': info.get('title', 'Sans titre'),
                'thumbnail': info.get('thumbnail'),
                'duration': info.get('duration'),
                'uploader': info.get('uploader'),
                'formats': formats,
                'platform': info.get('extractor_key', 'Unknown')
            }
    except Exception as e:
        logger.error(f"Erreur lors de la récupération des infos: {str(e)}")
        return None

def download_video(url, format_id, quality, download_id):
    try:
        ydl_opts = {
            'outtmpl': os.path.join(DOWNLOADS_DIR, '%(title)s.%(ext)s'),
            'progress_hooks': [ProgressHook(download_id)],
            'noplaylist': True,
            'ffmpeg_location': os.getenv('FFMPEG_PATH', '/usr/bin/ffmpeg'),
            'restrictfilenames': True
        }

        if quality == 'audio':
            ydl_opts.update({
                'format': 'bestaudio/best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }]
            })
        elif format_id:
            ydl_opts['format'] = format_id
        else:
            ydl_opts['format'] = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            final_filename = ydl.prepare_filename(info)
            download_progress[download_id]['final_path'] = final_filename

    except Exception as e:
        logger.error(f"Erreur de téléchargement: {str(e)}")
        download_progress[download_id] = {
            'status': 'error',
            'error': str(e)
        }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/get_info', methods=['POST'])
def get_info():
    data = request.get_json()
    url = data.get('url', '').strip()
    
    if not url:
        return jsonify({'error': 'URL vide'}), 400
    
    try:
        parsed_url = urlparse(url)
        if not parsed_url.scheme or not parsed_url.netloc:
            return jsonify({'error': 'URL invalide'}), 400
    except Exception:
        return jsonify({'error': 'Format URL incorrect'}), 400

    info = get_video_info(url)
    if not info:
        return jsonify({'error': 'Impossible de récupérer les informations vidéo'}), 400
    
    return jsonify(info)

@app.route('/download', methods=['POST'])
def download():
    data = request.get_json()
    url = data.get('url', '').strip()
    format_id = data.get('format_id')
    quality = data.get('quality', 'best')
    
    if not url:
        return jsonify({'error': 'URL vide'}), 400
    
    download_id = str(uuid.uuid4())
    download_progress[download_id] = {'status': 'starting', 'percent': 0}
    
    thread = threading.Thread(
        target=download_video,
        args=(url, format_id, quality, download_id)
    )
    thread.daemon = True
    thread.start()
    
    return jsonify({'download_id': download_id})

@app.route('/progress/<download_id>')
def get_progress(download_id):
    return jsonify(download_progress.get(download_id, {'status': 'not_found'}))

@app.route('/download_file/<download_id>')
def download_file(download_id):
    progress = download_progress.get(download_id)
    
    if not progress or progress['status'] != 'finished':
        return "Téléchargement non terminé", 404
    
    filepath = progress.get('final_path')
    if not filepath or not os.path.exists(filepath):
        return "Fichier introuvable", 404
    
    filename = os.path.basename(filepath)
    return send_file(
        filepath,
        as_attachment=True,
        download_name=filename
    )

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)