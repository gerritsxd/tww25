// TheWhereWhat - Main Application
(function() {
  'use strict';

  // ===========================================
  // DEVICE FINGERPRINTING
  // ===========================================
  function generateFingerprint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('fingerprint', 2, 2);
    const canvasData = canvas.toDataURL();

    const components = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || 0,
      navigator.deviceMemory || 0,
      canvasData.slice(-50),
      navigator.platform || ''
    ];

    let hash = 0;
    const str = components.join('|');
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  // Check for debug fingerprint override via URL param: ?fp=user1
  const urlParams = new URLSearchParams(window.location.search);
  const debugFingerprint = urlParams.get('fp');
  const FINGERPRINT = debugFingerprint || generateFingerprint();
  
  if (debugFingerprint) {
    console.log('🔧 Debug mode: Using fingerprint override:', debugFingerprint);
  }

  // ===========================================
  // STATE
  // ===========================================
  let map;
  let bubbles = new Map();
  let currentLocation = null;
  let selectedLocation = null; // For manual location selection
  let currentBubbleId = null;
  let userVotes = new Map();
  let ws;
  let locationMarker = null;

  // ===========================================
  // MAP INITIALIZATION
  // ===========================================
  function initMap() {
    // Default to Amsterdam
    const defaultLat = 52.3676;
    const defaultLng = 4.9041;

    map = L.map('map', {
      center: [defaultLat, defaultLng],
      zoom: 14,
      zoomControl: true,
      attributionControl: false,
      doubleClickZoom: false // Disable double-click zoom since we use it for posting
    });
    
    // Try to center on user's actual location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLat = position.coords.latitude;
          const userLng = position.coords.longitude;
          map.setView([userLat, userLng], 14);
          console.log('📍 Centered on user location:', userLat, userLng);
        },
        (error) => {
          console.log('📍 Using default location (Amsterdam)');
        }
      );
    }

    // Use CartoDB dark tiles for aesthetic
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(map);

    // No clustering - we want to see individual bubble sizes!
    // Bubbles are added directly to map

    // Double-tap/double-click on map to create a bubble (iOS-friendly)
    let lastTap = 0;
    let lastTapPos = null;
    let longPressTimer = null;
    let longPressPos = null;
    
    // Method 1: Double-tap detection (longer window for iOS)
    map.on('click', (e) => {
      const now = Date.now();
      const tapPos = { lat: e.latlng.lat, lng: e.latlng.lng };
      
      // Check if this is a double-tap (within 600ms for iOS)
      if (lastTap && (now - lastTap) < 600 && lastTapPos) {
        const distance = Math.abs(tapPos.lat - lastTapPos.lat) + Math.abs(tapPos.lng - lastTapPos.lng);
        if (distance < 0.0001) {
          handleMapDoubleClick(e);
          lastTap = 0;
          return;
        }
      }
      
      lastTap = now;
      lastTapPos = tapPos;
    });
    
    // Method 2: Long press (hold for 500ms) - iOS fallback
    map.on('mousedown touchstart', (e) => {
      const latlng = e.latlng;
      longPressPos = latlng;
      
      longPressTimer = setTimeout(() => {
        // Show visual feedback
        const pulseMarker = L.circleMarker(latlng, {
          radius: 30,
          color: '#00f5d4',
          fillColor: '#00f5d4',
          fillOpacity: 0.3,
          weight: 2
        }).addTo(map);
        
        setTimeout(() => map.removeLayer(pulseMarker), 300);
        
        handleMapDoubleClick({ latlng });
      }, 500);
    });
    
    map.on('mouseup touchend mousemove touchmove', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    });
    
    // Keep dblclick for desktop
    map.on('dblclick', handleMapDoubleClick);

    // Get user location
    locateUser();

    // Load existing bubbles
    loadBubbles();

    // Connect WebSocket
    connectWebSocket();
  }

  function handleMapDoubleClick(e) {
    // Set location and open create modal
    selectedLocation = {
      lat: e.latlng.lat,
      lng: e.latlng.lng
    };
    openCreateModal();
  }

  function updateLocationMarker() {
    if (!selectedLocation && !currentLocation) return;
    
    const loc = selectedLocation || currentLocation;
    
    if (locationMarker) {
      locationMarker.setLatLng([loc.lat, loc.lng]);
    } else {
      const icon = L.divIcon({
        className: 'location-pin',
        html: `<div class="location-pin-inner">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C7.58 0 4 3.58 4 8c0 5.25 8 13 8 13s8-7.75 8-13c0-4.42-3.58-8-8-8zm0 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/>
          </svg>
        </div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 40]
      });
      locationMarker = L.marker([loc.lat, loc.lng], { icon, zIndexOffset: 1000 }).addTo(map);
    }
  }

  // ===========================================
  // GEOLOCATION
  // ===========================================
  function locateUser() {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          currentLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          map.setView([currentLocation.lat, currentLocation.lng], 15);
          
          // If no manual selection, use current location
          if (!selectedLocation) {
            selectedLocation = currentLocation;
          }
          updateLocationText();
          updateLocationMarker();
        },
        (error) => {
          console.log('Geolocation error:', error);
          // Use map center as default
          const center = map.getCenter();
          currentLocation = { lat: center.lat, lng: center.lng };
          selectedLocation = currentLocation;
          updateLocationText();
          showToast('Click map to set location', 'info');
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      // Use map center
      const center = map.getCenter();
      currentLocation = { lat: center.lat, lng: center.lng };
      selectedLocation = currentLocation;
      updateLocationText();
    }
  }

  function updateLocationText() {
    const el = document.getElementById('locationText');
    const loc = selectedLocation || currentLocation;
    if (loc) {
      el.textContent = `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`;
    } else {
      el.textContent = 'Click map to set location';
    }
  }

  // ===========================================
  // WEBSOCKET
  // ===========================================
  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'new_bubble':
          addBubbleToMap(data.bubble);
          updateBubbleCount();
          break;
        case 'update_bubble':
          updateBubbleOnMap(data.bubble);
          break;
        case 'cleanup':
          loadBubbles(); // Refresh all bubbles
          break;
        case 'decay_tick':
          applyDecay();
          break;
      }
    };

    ws.onclose = () => {
      setTimeout(connectWebSocket, 3000); // Reconnect after 3s
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  // ===========================================
  // BUBBLE MANAGEMENT
  // ===========================================
  async function loadBubbles() {
    try {
      const response = await fetch('/api/bubbles');
      const data = await response.json();
      
      // Clear existing bubbles from map
      bubbles.forEach((entry) => {
        map.removeLayer(entry.marker);
      });
      bubbles.clear();

      // Add all bubbles
      data.forEach(bubble => addBubbleToMap(bubble));
      updateBubbleCount();
    } catch (error) {
      console.error('Error loading bubbles:', error);
    }
  }


  function getBubbleClass(bubble) {
    // All bot bubbles are grey
    if (bubble.bot_source) {
      return 'bot';
    }
    
    // User bubbles color by score
    if (bubble.score >= 10) return 'hot';
    if (bubble.score <= -3) return 'cold';
    return '';
  }

  function createBubbleIcon(bubble) {
    // Base size, bigger with upvotes, smaller with downvotes
    const baseSize = 20;
    const sizeChange = bubble.score * 3;
    const fontSize = Math.max(10, Math.min(50, baseSize + sizeChange));
    
    const bubbleClass = getBubbleClass(bubble);
    
    // Single dot
    return L.divIcon({
      className: 'bubble-dot',
      html: `<span class="dot ${bubbleClass}" style="font-size:${fontSize}px">•</span>`,
      iconSize: [fontSize, fontSize],
      iconAnchor: [fontSize/2, fontSize/2]
    });
  }

  function addBubbleToMap(bubble) {
    if (bubbles.has(bubble.id)) {
      updateBubbleOnMap(bubble);
      return;
    }

    const icon = createBubbleIcon(bubble);
    const marker = L.marker([bubble.lat, bubble.lng], { icon });

    // Double-tap to open bubble details (iOS-friendly with long-press fallback)
    let markerLastTap = 0;
    let markerLongPress = null;
    
    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      const now = Date.now();
      
      // Double-tap detection (600ms window for iOS)
      if (markerLastTap && (now - markerLastTap) < 600) {
        openBubble(bubble.id);
        markerLastTap = 0;
      } else {
        markerLastTap = now;
      }
    });
    
    // Long-press alternative for iOS (hold 500ms)
    marker.on('mousedown touchstart', (e) => {
      L.DomEvent.stopPropagation(e);
      markerLongPress = setTimeout(() => {
        openBubble(bubble.id);
      }, 500);
    });
    
    marker.on('mouseup touchend mousemove touchmove', () => {
      if (markerLongPress) {
        clearTimeout(markerLongPress);
        markerLongPress = null;
      }
    });
    
    // Keep dblclick for desktop
    marker.on('dblclick', (e) => {
      L.DomEvent.stopPropagation(e);
      openBubble(bubble.id);
    });
    
    // Show title on hover
    marker.on('mouseover', () => marker.openTooltip());
    marker.on('mouseout', () => marker.closeTooltip());
    
    marker.bubbleId = bubble.id;
    bubbles.set(bubble.id, { data: bubble, marker });
    marker.addTo(map); // Add directly to map, no clustering
  }

  function updateBubbleOnMap(bubble) {
    const existing = bubbles.get(bubble.id);
    if (!existing) {
      addBubbleToMap(bubble);
      return;
    }

    existing.data = bubble;
    const icon = createBubbleIcon(bubble);
    existing.marker.setIcon(icon);

    // Update view modal if open
    if (currentBubbleId === bubble.id) {
      displayBubble(bubble);
    }
  }

  function applyDecay() {
    // Decay is handled server-side, just refresh if needed
  }

  function updateBubbleCount() {
    document.getElementById('bubbleCount').textContent = bubbles.size;
  }

  // ===========================================
  // CREATE BUBBLE
  // ===========================================
  async function createBubble(formData) {
    try {
      const response = await fetch('/api/bubbles', {
        method: 'POST',
        headers: {
          'X-Client-Fingerprint': FINGERPRINT
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to create bubble');
      }

      const bubble = await response.json();
      showToast('Bubble dropped! 🎉', 'success');
      closeCreateModal();
      
      // Center on new bubble
      map.setView([bubble.lat, bubble.lng], 16);
    } catch (error) {
      console.error('Error creating bubble:', error);
      showToast('Failed to create bubble', 'error');
    }
  }

  // ===========================================
  // VIEW BUBBLE
  // ===========================================
  async function openBubble(id) {
    currentBubbleId = id;
    const entry = bubbles.get(id);
    if (!entry) return;

    displayBubble(entry.data);
    
    // Fetch user's vote
    try {
      const response = await fetch(`/api/bubbles/${id}/vote`, {
        headers: { 'X-Client-Fingerprint': FINGERPRINT }
      });
      const data = await response.json();
      userVotes.set(id, data.vote);
      updateVoteButtons(data.vote);
    } catch (error) {
      console.error('Error fetching vote:', error);
    }

    document.getElementById('viewModal').classList.add('active');
  }

  function displayBubble(bubble) {
    document.getElementById('bubbleTitle').textContent = bubble.title;
    
    let caption = bubble.caption || '';
    if (bubble.bot_source) {
      caption = `🤖 Auto-posted from ${bubble.bot_source}\n\n${caption}`;
    }
    if (bubble.event_url) {
      caption += `\n\n🔗 ${bubble.event_url}`;
    }
    document.getElementById('bubbleCaption').textContent = caption;
    
    const scoreEl = document.getElementById('bubbleScore');
    scoreEl.textContent = bubble.score > 0 ? `+${bubble.score}` : bubble.score;
    scoreEl.className = 'score';
    if (bubble.score > 0) scoreEl.classList.add('positive');
    if (bubble.score < 0) scoreEl.classList.add('negative');

    // Time ago
    const timeAgo = getTimeAgo(bubble.created_at);
    document.getElementById('bubbleTime').textContent = timeAgo;

    // Media
    const mediaContainer = document.getElementById('bubbleMedia');
    mediaContainer.innerHTML = '';

    if (bubble.media_url) {
      if (bubble.media_type === 'image') {
        mediaContainer.innerHTML = `<img src="${bubble.media_url}" alt="${escapeHtml(bubble.title)}">`;
      } else if (bubble.media_type === 'video') {
        mediaContainer.innerHTML = `<video src="${bubble.media_url}" controls playsinline></video>`;
      } else if (bubble.media_type === 'audio') {
        mediaContainer.innerHTML = `<audio src="${bubble.media_url}" controls></audio>`;
      }
    }
  }

  function updateVoteButtons(vote) {
    const upBtn = document.getElementById('upvoteBtn');
    const downBtn = document.getElementById('downvoteBtn');
    
    upBtn.classList.toggle('active', vote === 1);
    downBtn.classList.toggle('active', vote === -1);
  }

  function closeViewModal() {
    document.getElementById('viewModal').classList.remove('active');
    currentBubbleId = null;
  }

  // ===========================================
  // VOTING
  // ===========================================
  async function vote(value) {
    if (!currentBubbleId) return;

    try {
      const response = await fetch(`/api/bubbles/${currentBubbleId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Fingerprint': FINGERPRINT
        },
        body: JSON.stringify({ vote: value })
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === 'Cannot vote on your own bubble') {
          showToast("Can't vote on your own bubble!", 'error');
        } else if (data.error === 'Already voted') {
          showToast('Already voted!', 'error');
        } else {
          showToast(data.error || 'Vote failed', 'error');
        }
        return;
      }

      userVotes.set(currentBubbleId, data.yourVote);
      updateVoteButtons(data.yourVote);
      
      // Haptic feedback on mobile
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    } catch (error) {
      console.error('Error voting:', error);
      showToast('Failed to vote', 'error');
    }
  }

  // ===========================================
  // CREATE MODAL
  // ===========================================
  function openCreateModal() {
    // Use selected location (set by double-tap), current location, or map center
    if (!selectedLocation) {
      if (currentLocation) {
        selectedLocation = currentLocation;
      } else {
        const center = map.getCenter();
        selectedLocation = { lat: center.lat, lng: center.lng };
      }
    }
    
    updateLocationText();
    updateLocationMarker();
    document.getElementById('createModal').classList.add('active');
    document.getElementById('title').focus();
  }

  function closeCreateModal() {
    document.getElementById('createModal').classList.remove('active');
    document.getElementById('createForm').reset();
    resetMediaPreview();
    selectedLocation = null; // Clear so next double-tap sets new location
    
    // Remove location marker
    if (locationMarker) {
      map.removeLayer(locationMarker);
      locationMarker = null;
    }
  }

  // ===========================================
  // MEDIA HANDLING
  // ===========================================
  let selectedFile = null;

  function handleMediaSelect(file) {
    if (!file) return;

    selectedFile = file;
    const preview = document.getElementById('uploadPreview');
    const placeholder = document.getElementById('uploadPlaceholder');
    const imgEl = document.getElementById('previewImg');
    const videoEl = document.getElementById('previewVideo');
    const audioEl = document.getElementById('previewAudio');

    // Hide all previews first
    imgEl.classList.remove('active');
    videoEl.classList.remove('active');
    audioEl.classList.remove('active');

    const fileType = file.type.split('/')[0];
    const url = URL.createObjectURL(file);

    if (fileType === 'image') {
      imgEl.src = url;
      imgEl.classList.add('active');
    } else if (fileType === 'video') {
      videoEl.src = url;
      videoEl.classList.add('active');
    } else if (fileType === 'audio') {
      audioEl.src = url;
      audioEl.classList.add('active');
    }

    placeholder.hidden = true;
    preview.hidden = false;
  }

  function resetMediaPreview() {
    selectedFile = null;
    document.getElementById('mediaInput').value = '';
    document.getElementById('uploadPlaceholder').hidden = false;
    document.getElementById('uploadPreview').hidden = true;
    
    const imgEl = document.getElementById('previewImg');
    const videoEl = document.getElementById('previewVideo');
    const audioEl = document.getElementById('previewAudio');
    
    imgEl.classList.remove('active');
    videoEl.classList.remove('active');
    audioEl.classList.remove('active');
    imgEl.src = '';
    videoEl.src = '';
    audioEl.src = '';
  }

  // ===========================================
  // UTILITIES
  // ===========================================
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-20px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ===========================================
  // EVENT LISTENERS
  // ===========================================
  function initEventListeners() {
    // Locate button
    document.getElementById('locateBtn').addEventListener('click', () => {
      locateUser();
    });

    // Create modal
    document.getElementById('closeCreate').addEventListener('click', closeCreateModal);
    document.querySelector('#createModal .modal-backdrop').addEventListener('click', closeCreateModal);

    // View modal
    document.getElementById('closeView').addEventListener('click', closeViewModal);
    document.querySelector('#viewModal .modal-backdrop').addEventListener('click', closeViewModal);

    // Media upload
    document.getElementById('uploadPlaceholder').addEventListener('click', () => {
      document.getElementById('mediaInput').click();
    });

    document.getElementById('mediaInput').addEventListener('change', (e) => {
      handleMediaSelect(e.target.files[0]);
    });

    document.getElementById('removeMedia').addEventListener('click', resetMediaPreview);

    // Create form
    document.getElementById('createForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const loc = selectedLocation || currentLocation;
      if (!loc) {
        showToast('Please select a location on the map', 'error');
        return;
      }

      const submitBtn = document.getElementById('submitBtn');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<div class="spinner"></div>';

      const formData = new FormData();
      formData.append('lat', loc.lat);
      formData.append('lng', loc.lng);
      formData.append('title', document.getElementById('title').value.trim());
      formData.append('caption', document.getElementById('caption').value.trim());
      
      if (selectedFile) {
        formData.append('media', selectedFile);
      }

      await createBubble(formData);

      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Drop Bubble</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>';
    });

    // Voting
    document.getElementById('upvoteBtn').addEventListener('click', () => vote(1));
    document.getElementById('downvoteBtn').addEventListener('click', () => vote(-1));

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeCreateModal();
        closeViewModal();
      }
    });

    // Drag and drop for media
    const uploadArea = document.getElementById('mediaUpload');
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = 'var(--accent)';
    });
    uploadArea.addEventListener('dragleave', () => {
      uploadArea.style.borderColor = '';
    });
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = '';
      if (e.dataTransfer.files.length) {
        handleMediaSelect(e.dataTransfer.files[0]);
      }
    });
  }

  // ===========================================
  // INIT
  // ===========================================
  // ===========================================
  // SUGGESTIONS / FEEDBACK
  // ===========================================
  function initSuggestions() {
    const suggestionsModal = document.getElementById('suggestionsModal');
    const feedbackBtn = document.getElementById('feedbackBtn');
    const closeSuggestionsBtn = document.getElementById('closeSuggestions');
    const suggestionForm = document.getElementById('suggestionForm');
    const suggestionsList = document.getElementById('suggestionsList');

    feedbackBtn.addEventListener('click', () => {
      suggestionsModal.classList.add('active');
      loadSuggestions();
    });

    closeSuggestionsBtn.addEventListener('click', () => {
      suggestionsModal.classList.remove('active');
    });

    suggestionForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const title = document.getElementById('suggestionTitle').value;
      const description = document.getElementById('suggestionDescription').value;
      
      try {
        const response = await fetch('/tww/api/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description })
        });
        
        if (response.ok) {
          suggestionForm.reset();
          showToast('Idea submitted! 🎉');
          loadSuggestions();
        }
      } catch (error) {
        showToast('Failed to submit idea');
      }
    });

    async function loadSuggestions() {
      try {
        const response = await fetch('/tww/api/suggestions');
        const suggestions = await response.json();
        
        if (suggestions.length === 0) {
          suggestionsList.innerHTML = '<div class="no-suggestions">Be the first to suggest something! 💡</div>';
          return;
        }
        
        suggestionsList.innerHTML = '';
        
        for (const suggestion of suggestions) {
          const voteResponse = await fetch(`/tww/api/suggestions/${suggestion.id}/vote`);
          const voteData = await voteResponse.json();
          
          const item = document.createElement('div');
          item.className = 'suggestion-item';
          item.innerHTML = `
            <button class="suggestion-vote ${voteData.voted ? 'voted' : ''}" data-id="${suggestion.id}">
              <span class="vote-icon">▲</span>
              <span class="vote-number">${suggestion.votes}</span>
            </button>
            <div class="suggestion-content">
              <div class="suggestion-title">${escapeHtml(suggestion.title)}</div>
              ${suggestion.description ? `<div class="suggestion-description">${escapeHtml(suggestion.description)}</div>` : ''}
              <div class="suggestion-time">${getTimeAgo(suggestion.created_at)}</div>
            </div>
          `;
          
          const voteBtn = item.querySelector('.suggestion-vote');
          voteBtn.addEventListener('click', async () => {
            try {
              const res = await fetch(`/tww/api/suggestions/${suggestion.id}/vote`, { method: 'POST' });
              const data = await res.json();
              voteBtn.classList.toggle('voted', data.voted);
              voteBtn.querySelector('.vote-number').textContent = data.votes;
            } catch (error) {
              console.error('Vote failed:', error);
            }
          });
          
          suggestionsList.appendChild(item);
        }
      } catch (error) {
        suggestionsList.innerHTML = '<div class="suggestions-error">Failed to load suggestions</div>';
      }
    }
  }

  // ===========================================
  // WELCOME TUTORIAL
  // ===========================================
  function initWelcome() {
    const welcomeModal = document.getElementById('welcomeModal');
    const startBtn = document.getElementById('startBtn');
    const hasVisited = localStorage.getItem('tww_visited');

    // Detect iOS/iPhone
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // Update tutorial text for iOS users
    if (isIOS) {
      const hintBar = document.getElementById('hintBar');
      const tutorialSteps = document.querySelectorAll('.tutorial-step .step-text');
      
      if (hintBar) {
        hintBar.querySelector('span').textContent = '👉 Hold map for 1 sec to drop a bubble';
      }
      
      tutorialSteps.forEach(step => {
        if (step.textContent.includes('Tap-tap or hold bubbles')) {
          step.textContent = '👉 Hold bubbles for 1 sec to see details';
        } else if (step.textContent.includes('Tap-tap or hold map')) {
          step.textContent = '👉 Hold map for 1 sec to drop your bubble';
        }
      });
    }

    if (hasVisited) {
      // User has visited before, hide welcome
      welcomeModal.classList.remove('active');
    }

    startBtn.addEventListener('click', () => {
      welcomeModal.classList.remove('active');
      localStorage.setItem('tww_visited', 'true');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initWelcome();
    initSuggestions();
    initMap();
    initEventListeners();
  });

})();
