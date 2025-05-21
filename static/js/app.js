document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const elements = {
        sections: {
            login: document.getElementById('login-section'),
            nowPlaying: document.getElementById('now-playing-section'),
            notPlaying: document.getElementById('not-playing-section')
        },
        player: {
            albumArt: document.getElementById('album-art'),
            songTitle: document.getElementById('song-title'),
            artistName: document.getElementById('artist-name'),
            albumName: document.getElementById('album-name'),
            progressBar: document.getElementById('progress-bar'),
            currentTime: document.getElementById('current-time'),
            totalTime: document.getElementById('total-time'),
            audioBars: document.getElementById('audio-bars')
        },
        lyrics: document.getElementById('lyrics-container')
    };

    // State
    const state = {
        currentSong: null,
        progressInterval: null
    };

    // Initialize
    initApp();

    function initApp() {
        initBackgroundAnimations();
        checkLoginStatus();
        setupWebSocket();
    }

    function checkLoginStatus() {
        fetch('/now_playing')
            .then(response => response.json())
            .then(data => {
                if (data.error === 'Not logged in') {
                    showSection(elements.sections.login);
                } else {
                    handleTrackUpdate(data);
                }
            })
            .catch(error => console.error('Error:', error));
    }

    function setupWebSocket() {
        const socket = io();
        
        // Check for song updates every 3 seconds
        setInterval(() => {
            socket.emit('check_song_update');
        }, 3000);

        // Handle song updates from socket
        socket.on('song_update', data => handleTrackUpdate(data));
    }

    function handleTrackUpdate(data) {
        if (!data || !data.is_playing) {
            showSection(elements.sections.notPlaying);
            setAudioBarsState('paused');
            clearProgressInterval();
            return;
        }

        // Validate and sanitize data
        sanitizeTrackData(data);

        // Check if song has changed
        const songChanged = !state.currentSong || 
                           state.currentSong.name !== data.name || 
                           state.currentSong.artist !== data.artist;
        
        // Update current song
        state.currentSong = data;
        
        // Update UI
        showSection(elements.sections.nowPlaying);
        setAudioBarsState('playing');
        updateSongInfo(data);
        
        // Handle progress updates
        setupProgressUpdates(data);
        
        // Get lyrics if song changed
        if (songChanged) {
            updateLyrics();
        }
    }

    function sanitizeTrackData(data) {
        // Ensure duration is valid
        if (!data.duration_ms || data.duration_ms <= 0) {
            console.error("Invalid duration received:", data.duration_ms);
            data.duration_ms = 0;
        }
        
        // Ensure progress is valid
        if (!data.progress_ms || data.progress_ms < 0) {
            console.error("Invalid progress received:", data.progress_ms);
            data.progress_ms = 0;
        }
        
        // Ensure progress doesn't exceed duration
        if (data.progress_ms > data.duration_ms) {
            data.progress_ms = data.duration_ms;
        }
    }

    function setupProgressUpdates(data) {
        // Clear existing interval
        clearProgressInterval();
        
        // Update progress immediately
        updateProgress(data);
        
        // Set up new interval
        state.progressInterval = setInterval(() => {
            if (state.currentSong) {
                // Only increment if not at the end
                if (state.currentSong.progress_ms < state.currentSong.duration_ms) {
                    state.currentSong.progress_ms += 1000;
                }
                
                if (state.currentSong.progress_ms >= state.currentSong.duration_ms) {
                    // Cap at duration
                    state.currentSong.progress_ms = state.currentSong.duration_ms;
                    
                    // Re-check with server after song ends
                    setTimeout(() => {
                        const socket = io();
                        socket.emit('check_song_update');
                    }, 2000);
                }
                
                updateProgress(state.currentSong);
            }
        }, 1000);
    }

    function clearProgressInterval() {
        if (state.progressInterval) {
            clearInterval(state.progressInterval);
            state.progressInterval = null;
        }
    }
    
    function showSection(sectionToShow) {
        // Hide all sections
        Object.values(elements.sections).forEach(section => {
            if (section) section.classList.add('d-none');
        });
        
        // Show selected section with fade-in
        if (sectionToShow) {
            sectionToShow.classList.remove('d-none');
            sectionToShow.style.opacity = 0;
            setTimeout(() => {
                sectionToShow.style.opacity = 1;
            }, 10);
        }
    }
    
    function updateSongInfo(data) {
        // Update album art with animation
        const albumArt = elements.player.albumArt;
        if (albumArt.src !== data.album_art) {
            albumArt.style.opacity = 0;
            setTimeout(() => {
                albumArt.src = data.album_art;
                albumArt.style.opacity = 1;
            }, 300);
        } else {
            albumArt.src = data.album_art;
        }
        
        // Update text elements with fade effect
        animateTextChange(elements.player.songTitle, data.name);
        animateTextChange(elements.player.artistName, data.artist);
        animateTextChange(elements.player.albumName, data.album);
        
        // Update time display
        elements.player.totalTime.textContent = formatTime(data.duration_ms);
    }
    
    function animateTextChange(element, newText) {
        if (element.textContent !== newText) {
            element.style.opacity = 0;
            setTimeout(() => {
                element.textContent = newText;
                element.style.opacity = 1;
            }, 300);
        } else {
            element.textContent = newText;
        }
    }
    
    function updateProgress(data) {
        // Calculate progress percentage (safely)
        const progress = data.duration_ms > 0 ? (data.progress_ms / data.duration_ms) * 100 : 0;
        const clampedProgress = Math.min(progress, 100);
        
        // Update UI
        elements.player.progressBar.style.width = `${clampedProgress}%`;
        elements.player.currentTime.textContent = formatTime(data.progress_ms);
    }
    
    function updateLyrics() {
        const lyricsContainer = elements.lyrics;
        lyricsContainer.classList.add('loading');
        lyricsContainer.textContent = 'Loading lyrics...';
        
        fetch('/get_lyrics')
            .then(response => response.json())
            .then(data => {
                lyricsContainer.classList.remove('loading');
                
                // Fade transition for lyrics update
                lyricsContainer.style.opacity = 0;
                setTimeout(() => {
                    lyricsContainer.textContent = data.lyrics || 'Lyrics not found';
                    lyricsContainer.style.opacity = 1;
                }, 300);
            })
            .catch(error => {
                console.error('Error fetching lyrics:', error);
                lyricsContainer.classList.remove('loading');
                lyricsContainer.textContent = 'Error loading lyrics';
            });
    }
    
    function setAudioBarsState(state) {
        const audioBars = elements.player.audioBars;
        if (!audioBars) return;
        
        if (state === 'playing') {
            audioBars.classList.remove('paused');
            audioBars.classList.add('playing');
        } else {
            audioBars.classList.remove('playing');
            audioBars.classList.add('paused');
        }
    }
    
    function initBackgroundAnimations() {
        const bgAnimation = document.querySelector('.bg-animation');
        if (bgAnimation) {
            const bubbles = bgAnimation.querySelectorAll('span');
            bubbles.forEach(bubble => {
                const randomX = Math.random() * 100;
                const randomY = Math.random() * 100;
                bubble.style.left = `${randomX}%`;
                bubble.style.top = `${randomY}%`;
            });
        }
    }
    
    function formatTime(ms) {
        // Handle invalid inputs
        if (!ms || isNaN(ms) || ms < 0) {
            return "0:00";
        }
        
        const seconds = Math.floor(ms / 1000);
        
        // Format with hours for long tracks
        if (seconds >= 3600) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const remainingSeconds = seconds % 60;
            return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        } 
        
        // Standard minutes:seconds format
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
});