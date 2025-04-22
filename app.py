import os
import json
import time
import re
from flask import Flask, redirect, request, session, url_for, render_template, jsonify, send_from_directory
from flask_socketio import SocketIO
import spotipy
from spotipy.oauth2 import SpotifyOAuth
from dotenv import load_dotenv
import requests
from bs4 import BeautifulSoup

# Load environment variables
load_dotenv()

app = Flask(__name__, static_folder='static')
app.secret_key = os.urandom(24)
socketio = SocketIO(app, cors_allowed_origins="*")

# Spotify API setup
SPOTIFY_CLIENT_ID = os.getenv('SPOTIFY_CLIENT_ID')
SPOTIFY_CLIENT_SECRET = os.getenv('SPOTIFY_CLIENT_SECRET')
SPOTIFY_REDIRECT_URI = os.getenv('SPOTIFY_REDIRECT_URI')
SCOPE = 'user-read-currently-playing user-read-playback-state'

# Cache for lyrics to avoid redundant requests
lyrics_cache = {}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/login')
def login():
    sp_oauth = SpotifyOAuth(
        client_id=SPOTIFY_CLIENT_ID,
        client_secret=SPOTIFY_CLIENT_SECRET,
        redirect_uri=SPOTIFY_REDIRECT_URI,
        scope=SCOPE
    )
    auth_url = sp_oauth.get_authorize_url()
    return redirect(auth_url)

@app.route('/callback')
def callback():
    sp_oauth = SpotifyOAuth(
        client_id=SPOTIFY_CLIENT_ID,
        client_secret=SPOTIFY_CLIENT_SECRET,
        redirect_uri=SPOTIFY_REDIRECT_URI,
        scope=SCOPE
    )
    session.clear()
    code = request.args.get('code')
    token_info = sp_oauth.get_access_token(code)
    session['token_info'] = token_info
    return redirect(url_for('index'))

def get_token():
    token_info = session.get('token_info', None)
    if not token_info:
        return None
    
    now = int(time.time())
    is_expired = token_info['expires_at'] - now < 60
    
    if is_expired:
        sp_oauth = SpotifyOAuth(
            client_id=SPOTIFY_CLIENT_ID,
            client_secret=SPOTIFY_CLIENT_SECRET,
            redirect_uri=SPOTIFY_REDIRECT_URI,
            scope=SCOPE
        )
        token_info = sp_oauth.refresh_access_token(token_info['refresh_token'])
        session['token_info'] = token_info
    
    return token_info

@app.route('/now_playing')
def now_playing():
    token_info = get_token()
    if not token_info:
        return jsonify({'error': 'Not logged in'})
    
    sp = spotipy.Spotify(auth=token_info['access_token'])
    current_track = sp.current_playback()
    
    if current_track is None or not current_track['is_playing']:
        return jsonify({'is_playing': False})
    
    track_info = {
        'is_playing': True,
        'name': current_track['item']['name'],
        'artist': current_track['item']['artists'][0]['name'],
        'album': current_track['item']['album']['name'],
        'album_art': current_track['item']['album']['images'][0]['url'],
        'duration_ms': current_track['item']['duration_ms'],
        'progress_ms': current_track['progress_ms']
    }
    
    return jsonify(track_info)

def get_azlyrics_url(artist, song):
    """
    Creates a URL in the format AZLyrics expects
    """
    # Format artist and song name for URL
    artist = artist.lower().replace(' ', '').replace('.', '')
    song = song.lower().replace(' ', '').replace('.', '')
    
    # Remove special characters
    artist = re.sub(r'[^a-zA-Z0-9]', '', artist)
    song = re.sub(r'[^a-zA-Z0-9]', '', song)
    
    return f"https://www.azlyrics.com/lyrics/{artist}/{song}.html"

def scrape_azlyrics(url):
    """
    Attempts to scrape lyrics from AZLyrics.
    Note: This might not always work due to anti-scraping measures.
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://www.google.com/',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # AZLyrics usually has the lyrics in a div without a class or id
        # It's typically after a comment that says "start of lyrics"
        lyrics_div = soup.find('div', class_='', id='')
        
        if lyrics_div:
            lyrics = lyrics_div.get_text().strip()
            return lyrics
        else:
            # Alternative approach: find divs with specific attributes
            for div in soup.find_all('div'):
                if not div.get('class') and not div.get('id'):
                    text = div.get_text().strip()
                    if len(text) > 100:  # Assuming lyrics are at least 100 chars
                        return text
            
            return "Lyrics not found on AZLyrics"
    except Exception as e:
        return f"Error fetching lyrics: {str(e)}"

@app.route('/get_lyrics')
def get_lyrics():
    token_info = get_token()
    if not token_info:
        return jsonify({'error': 'Not logged in'})
    
    sp = spotipy.Spotify(auth=token_info['access_token'])
    current_track = sp.current_playback()
    
    if current_track is None or not current_track['is_playing']:
        return jsonify({'error': 'No track currently playing'})
    
    track_name = current_track['item']['name']
    artist_name = current_track['item']['artists'][0]['name']
    
    # Create a cache key
    cache_key = f"{track_name}_{artist_name}"
    
    # Check if lyrics are in cache
    if cache_key in lyrics_cache:
        return jsonify({'lyrics': lyrics_cache[cache_key]})
    
    # Get lyrics from AZLyrics
    try:
        url = get_azlyrics_url(artist_name, track_name)
        lyrics = scrape_azlyrics(url)
        
        # Cache the lyrics
        lyrics_cache[cache_key] = lyrics
        return jsonify({'lyrics': lyrics})
    except Exception as e:
        error_msg = f"Error: {str(e)}"
        return jsonify({'lyrics': error_msg})

@socketio.on('check_song_update')
def check_song_update():
    token_info = get_token()
    if not token_info:
        return
    
    sp = spotipy.Spotify(auth=token_info['access_token'])
    current_track = sp.current_playback()
    
    if current_track is None or not current_track['is_playing']:
        socketio.emit('song_update', {'is_playing': False})
        return
    
    track_info = {
        'is_playing': True,
        'name': current_track['item']['name'],
        'artist': current_track['item']['artists'][0]['name'],
        'album': current_track['item']['album']['name'],
        'album_art': current_track['item']['album']['images'][0]['url'],
        'duration_ms': current_track['item']['duration_ms'],
        'progress_ms': current_track['progress_ms']
    }
    
    socketio.emit('song_update', track_info)

if __name__ == '__main__':
    socketio.run(app, debug=True)
