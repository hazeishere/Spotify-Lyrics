# Spotify Lyrics Real-Time

This web application connects to your Spotify account, displays your currently playing song, and fetches lyrics from the Lyrics.ovh API.

## Features

- Real-time tracking of currently playing Spotify song
- Displays song information, album art, and progress bar
- Fetches and displays lyrics from Lyrics.ovh API
- Automatic updates when songs change

## Setup

### Prerequisites

- Python 3.10+
- Spotify Developer account

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Set up Spotify API

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/)
2. Create a new application
3. Set the Redirect URI to `http://127.0.0.1:5000/callback`
4. Note your Client ID and Client Secret

### 3. Configure Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

```
# Spotify API credentials
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:5000/callback
```

## Running the App

Start the application:

```bash
python app.py
```

Navigate to http://127.0.0.1:5000 in your web browser.

## How It Works

1. The app authenticates with Spotify using OAuth
2. It periodically checks what song you're playing
3. When a song is detected, it fetches lyrics from the Lyrics.ovh API
4. The UI updates in real-time using WebSockets
5. The lyrics are cached to avoid redundant requests

## About Lyrics.ovh API

The app uses the [Lyrics.ovh API](https://lyricsovh.docs.apiary.io/#) to fetch lyrics. This provides a simple and reliable way to get lyrics for most songs by making requests to:

```
https://api.lyrics.ovh/v1/{artist}/{song}
```

## Important Notes

- The app needs an active Spotify session (playing music) to work
- The app works best with Premium Spotify accounts that have full playback control
- Lyrics availability depends on the Lyrics.ovh API database