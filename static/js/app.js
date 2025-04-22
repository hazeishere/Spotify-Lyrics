document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const loginSection = document.getElementById('login-section');
    const nowPlayingSection = document.getElementById('now-playing-section');
    const notPlayingSection = document.getElementById('not-playing-section');
    const albumArt = document.getElementById('album-art');
    const songTitle = document.getElementById('song-title');
    const artistName = document.getElementById('artist-name');
    const albumName = document.getElementById('album-name');
    const progressBar = document.getElementById('progress-bar');
    const currentTime = document.getElementById('current-time');
    const totalTime = document.getElementById('total-time');
    const lyricsContainer = document.getElementById('lyrics-container');
    const audioBars = document.getElementById('audio-bars');

    let currentSong = null;
    let progressInterval = null;

    // Initialize animations for background elements
    initBackgroundAnimations();

    // First check if user is logged in by getting current track
    fetch('/now_playing')
        .then(response => response.json())
        .then(data => {
            if (data.error === 'Not logged in') {
                showSection(loginSection);
            } else {
                handleTrackUpdate(data);
            }
        })
        .catch(error => console.error('Error:', error));

    // Connect to WebSocket for real-time updates
    const socket = io();
    
    // Check for song updates every 3 seconds
    setInterval(() => {
        socket.emit('check_song_update');
    }, 3000);

    // Handle song updates from socket
    socket.on('song_update', (data) => {
        handleTrackUpdate(data);
    });

    // Function to format time in MM:SS
    function formatTime(ms) {
        // Safeguard against invalid inputs
        if (!ms || isNaN(ms) || ms < 0) {
            return "0:00";
        }
        
        // Convert to seconds
        const seconds = Math.floor(ms / 1000);
        
        // Handle hours for very long tracks
        if (seconds >= 3600) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const remainingSeconds = seconds % 60;
            return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        } else {
            // Regular minutes:seconds format
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
    }

    // Function to handle track updates
    function handleTrackUpdate(data) {
        if (!data || !data.is_playing) {
            showSection(notPlayingSection);
            setAudioBarsState('paused');
            
            // Clear progress interval if exists
            if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }
            return;
        }

        // Validate the data
        if (!data.duration_ms || data.duration_ms <= 0) {
            console.error("Invalid duration received:", data.duration_ms);
            data.duration_ms = 0; // Set default value to prevent NaN
        }
        
        if (!data.progress_ms || data.progress_ms < 0) {
            console.error("Invalid progress received:", data.progress_ms);
            data.progress_ms = 0; // Set default value to prevent NaN
        }
        
        // Ensure progress doesn't exceed duration
        if (data.progress_ms > data.duration_ms) {
            data.progress_ms = data.duration_ms;
        }

        // Check if song has changed
        const songChanged = !currentSong || currentSong.name !== data.name || currentSong.artist !== data.artist;
        
        // Update current song
        currentSong = data;
        
        // Show now playing section with animation
        showSection(nowPlayingSection);
        setAudioBarsState('playing');
        
        // Update UI with smooth transitions
        updateSongInfo(data);
        
        // Clear existing progress interval
        if (progressInterval) {
            clearInterval(progressInterval);
        }
        
        // Update progress every second
        updateProgress(data);
        progressInterval = setInterval(() => {
            if (currentSong) {
                // Only increment if not already at the end
                if (currentSong.progress_ms < currentSong.duration_ms) {
                    currentSong.progress_ms += 1000;
                }
                
                if (currentSong.progress_ms >= currentSong.duration_ms) {
                    // Cap at duration
                    currentSong.progress_ms = currentSong.duration_ms;
                    // Re-check with the server after 2 seconds at the end
                    setTimeout(() => {
                        socket.emit('check_song_update');
                    }, 2000);
                }
                
                updateProgress(currentSong);
            }
        }, 1000);
        
        // Get lyrics if song changed
        if (songChanged) {
            updateLyrics();
        }
    }
    
    // Function to show a section and hide others
    function showSection(sectionToShow) {
        // Hide all sections first
        [loginSection, nowPlayingSection, notPlayingSection].forEach(section => {
            if (section) section.classList.add('d-none');
        });
        
        // Show the selected section with a fade-in effect
        if (sectionToShow) {
            sectionToShow.classList.remove('d-none');
            sectionToShow.style.opacity = 0;
            setTimeout(() => {
                sectionToShow.style.opacity = 1;
            }, 10);
        }
    }
    
    // Function to update song information with animations
    function updateSongInfo(data) {
        // Animate album art change
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
        animateTextChange(songTitle, data.name);
        animateTextChange(artistName, data.artist);
        animateTextChange(albumName, data.album);
        
        // Update time displays
        totalTime.textContent = formatTime(data.duration_ms);
    }
    
    // Function to animate text changes
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
    
    // Function to update progress bar
    function updateProgress(data) {
        // Safety check for division by zero
        const progress = data.duration_ms > 0 ? (data.progress_ms / data.duration_ms) * 100 : 0;
        
        // Ensure progress doesn't exceed 100%
        const clampedProgress = Math.min(progress, 100);
        
        // Update the progress bar width
        progressBar.style.width = `${clampedProgress}%`;
        
        // Update the time text
        currentTime.textContent = formatTime(data.progress_ms);
    }
    
    // Function to update the lyrics
    function updateLyrics() {
        lyricsContainer.classList.add('loading');
        lyricsContainer.textContent = 'Loading lyrics...';
        
        fetch('/get_lyrics')
            .then(response => response.json())
            .then(data => {
                lyricsContainer.classList.remove('loading');
                if (data.lyrics) {
                    // Fade out, update, fade in
                    lyricsContainer.style.opacity = 0;
                    setTimeout(() => {
                        lyricsContainer.textContent = data.lyrics;
                        lyricsContainer.style.opacity = 1;
                    }, 300);
                } else {
                    lyricsContainer.textContent = 'Lyrics not found';
                }
            })
            .catch(error => {
                console.error('Error fetching lyrics:', error);
                lyricsContainer.classList.remove('loading');
                lyricsContainer.textContent = 'Error loading lyrics';
            });
    }
    
    // Function to set the state of audio bars
    function setAudioBarsState(state) {
        if (!audioBars) return;
        
        if (state === 'playing') {
            audioBars.classList.remove('paused');
            audioBars.classList.add('playing');
        } else {
            audioBars.classList.remove('playing');
            audioBars.classList.add('paused');
        }
    }
    
    // Initialize the animation for background elements
    function initBackgroundAnimations() {
        // Randomly position bubbles initially
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
}); 