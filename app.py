import os
import time
from flask import Flask, redirect, request, session, url_for, render_template, jsonify
from flask_socketio import SocketIO
import spotipy
from spotipy.oauth2 import SpotifyOAuth
from dotenv import load_dotenv
import requests

# Load environment variables
load_dotenv()

# App configuration
app = Flask(__name__, static_folder='static')
app.secret_key = os.urandom(24)
socketio = SocketIO(app, cors_allowed_origins="*")

# Spotify API configuration
SPOTIFY_CLIENT_ID = os.getenv('SPOTIFY_CLIENT_ID')
SPOTIFY_CLIENT_SECRET = os.getenv('SPOTIFY_CLIENT_SECRET')
SPOTIFY_REDIRECT_URI = os.getenv('SPOTIFY_REDIRECT_URI')
SCOPE = 'user-read-currently-playing user-read-playback-state'

# Cache for lyrics to avoid redundant requests
lyrics_cache = {}


def create_spotify_oauth():
    """Create and return a SpotifyOAuth instance"""
    return SpotifyOAuth(
        client_id=SPOTIFY_CLIENT_ID,
        client_secret=SPOTIFY_CLIENT_SECRET,
        redirect_uri=SPOTIFY_REDIRECT_URI,
        scope=SCOPE
    )


def get_token():
    """Get the current token or refresh if expired"""
    token_info = session.get('token_info')
    if not token_info:
        return None
    
    now = int(time.time())
    is_expired = token_info['expires_at'] - now < 60
    
    if is_expired:
        sp_oauth = create_spotify_oauth()
        token_info = sp_oauth.refresh_access_token(token_info['refresh_token'])
        session['token_info'] = token_info
    
    return token_info


def get_current_track(token_info):
    """Get the currently playing track from Spotify"""
    if not token_info:
        return None
    
    sp = spotipy.Spotify(auth=token_info['access_token'])
    return sp.current_playback()


def format_track_info(current_track):
    """Format track information for the frontend"""
    if not current_track or not current_track['is_playing']:
        return {'is_playing': False}
    
    return {
        'is_playing': True,
        'name': current_track['item']['name'],
        'artist': current_track['item']['artists'][0]['name'],
        'album': current_track['item']['album']['name'],
        'album_art': current_track['item']['album']['images'][0]['url'],
        'duration_ms': current_track['item']['duration_ms'],
        'progress_ms': current_track['progress_ms']
    }


def get_lyrics_from_api(artist, song):
    """Get lyrics using the Lyrics.ovh API"""
    url = f"https://api.lyrics.ovh/v1/{artist}/{song}"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        return data.get('lyrics', 'Lyrics not found')
    except requests.exceptions.RequestException as e:
        return f"Error fetching lyrics: {str(e)}"
    except ValueError:
        return "Error parsing lyrics response"


# Routes
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/login')
def login():
    sp_oauth = create_spotify_oauth()
    auth_url = sp_oauth.get_authorize_url()
    return redirect(auth_url)


@app.route('/callback')
def callback():
    sp_oauth = create_spotify_oauth()
    session.clear()
    code = request.args.get('code')
    token_info = sp_oauth.get_access_token(code)
    session['token_info'] = token_info
    return redirect(url_for('index'))


@app.route('/now_playing')
def now_playing():
    token_info = get_token()
    if not token_info:
        return jsonify({'error': 'Not logged in'})
    
    current_track = get_current_track(token_info)
    track_info = format_track_info(current_track)
    
    return jsonify(track_info)


@app.route('/get_lyrics')
def get_lyrics():
    token_info = get_token()
    if not token_info:
        return jsonify({'error': 'Not logged in'})
    
    current_track = get_current_track(token_info)
    
    if not current_track or not current_track['is_playing']:
        return jsonify({'error': 'No track currently playing'})
    
    track_name = current_track['item']['name']
    artist_name = current_track['item']['artists'][0]['name']
    
    # Create a cache key
    cache_key = f"{track_name}_{artist_name}"
    
    # Check if lyrics are in cache
    if cache_key in lyrics_cache:
        return jsonify({'lyrics': lyrics_cache[cache_key]})
    
    # Get lyrics from Lyrics.ovh API
    lyrics = get_lyrics_from_api(artist_name, track_name)
    
    # Cache the lyrics
    lyrics_cache[cache_key] = lyrics
    return jsonify({'lyrics': lyrics})


# WebSocket events
@socketio.on('check_song_update')
def check_song_update():
    token_info = get_token()
    if not token_info:
        return
    
    current_track = get_current_track(token_info)
    track_info = format_track_info(current_track)
    
    socketio.emit('song_update', track_info)


if __name__ == '__main__':
    socketio.run(app, debug=True)