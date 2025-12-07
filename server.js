const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const initSqlJs = require('sql.js');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { scrapeEventbriteAmsterdam } = require('./scrapers/eventbrite');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|mp4|webm|mov|mp3|wav|ogg/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext || mime);
  }
});

// Database setup
let db;
const DB_PATH = path.join(__dirname, 'bubbles.db');

async function initDatabase() {
  const SQL = await initSqlJs();
  
  // Try to load existing database
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS bubbles (
      id TEXT PRIMARY KEY,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      title TEXT NOT NULL,
      caption TEXT,
      media_url TEXT,
      media_type TEXT,
      score INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_interaction INTEGER NOT NULL,
      creator_fingerprint TEXT NOT NULL,
      bot_source TEXT DEFAULT NULL,
      event_url TEXT DEFAULT NULL,
      event_date INTEGER DEFAULT NULL,
      event_end_date INTEGER DEFAULT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS votes (
      bubble_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      vote INTEGER NOT NULL,
      PRIMARY KEY (bubble_id, fingerprint)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS suggestions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      votes INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      creator_fingerprint TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS suggestion_votes (
      suggestion_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      PRIMARY KEY (suggestion_id, fingerprint)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS suggestions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      upvotes INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      creator_fingerprint TEXT NOT NULL,
      status TEXT DEFAULT 'pending'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS suggestion_votes (
      suggestion_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      PRIMARY KEY (suggestion_id, fingerprint)
    )
  `);

  // Add new columns if they don't exist (for migration)
  try {
    db.run(`ALTER TABLE bubbles ADD COLUMN bot_source TEXT DEFAULT NULL`);
  } catch (e) {
    // Column might already exist
  }
  try {
    db.run(`ALTER TABLE bubbles ADD COLUMN event_url TEXT DEFAULT NULL`);
  } catch (e) {
    // Column might already exist
  }

  // Create indexes
  try {
    db.run(`CREATE INDEX IF NOT EXISTS idx_bubbles_location ON bubbles(lat, lng)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_bubbles_created ON bubbles(created_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_bubbles_interaction ON bubbles(last_interaction)`);
  } catch (e) {
    // Indexes might already exist
  }

  saveDatabase();
  console.log('Database initialized');
}

function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Helper function to get all results as array of objects
function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Helper to get single row
function dbGet(sql, params = []) {
  const results = dbAll(sql, params);
  return results[0] || null;
}

// Helper to run statement
function dbRun(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// WebSocket connections tracking
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

// Broadcast to all connected clients
function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Generate fingerprint from request headers
function getFingerprint(req) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const ua = req.headers['user-agent'] || '';
  const accept = req.headers['accept-language'] || '';
  // Combine with client fingerprint if provided
  const clientFp = req.headers['x-client-fingerprint'] || '';
  // Create a simple hash
  const data = `${ip}-${ua}-${accept}-${clientFp}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// API: Get all active bubbles
app.get('/api/bubbles', (req, res) => {
  const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
  const now = Date.now();
  
  // Get bubbles that are:
  // 1. User bubbles that have been interacted with in last 24h
  // 2. Bot events that haven't ended yet (or have no end date)
  const bubbles = dbAll(`
    SELECT * FROM bubbles WHERE 
    (bot_source IS NULL AND last_interaction > ?) OR
    (bot_source IS NOT NULL AND (event_end_date IS NULL OR event_end_date > ?))
  `, [cutoff, now]);
  
  res.json(bubbles);
});

// API: Create a bubble
app.post('/api/bubbles', upload.single('media'), (req, res) => {
  try {
    const { lat, lng, title, caption } = req.body;
    
    if (!lat || !lng || !title) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const id = uuidv4();
    const now = Date.now();
    const fingerprint = getFingerprint(req);
    
    let mediaUrl = null;
    let mediaType = null;
    
    if (req.file) {
      mediaUrl = `/tww/uploads/${req.file.filename}`;
      const ext = path.extname(req.file.filename).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
        mediaType = 'image';
      } else if (['.mp4', '.webm', '.mov'].includes(ext)) {
        mediaType = 'video';
      } else if (['.mp3', '.wav', '.ogg'].includes(ext)) {
        mediaType = 'audio';
      }
    }

    dbRun(
      `INSERT INTO bubbles (id, lat, lng, title, caption, media_url, media_type, score, created_at, last_interaction, creator_fingerprint, bot_source, event_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, NULL)`,
      [id, parseFloat(lat), parseFloat(lng), title, caption || '', mediaUrl, mediaType, now, now, fingerprint]
    );
    
    const bubble = dbGet('SELECT * FROM bubbles WHERE id = ?', [id]);
    
    // Broadcast new bubble to all clients
    broadcast({ type: 'new_bubble', bubble });
    
    res.json(bubble);
  } catch (error) {
    console.error('Error creating bubble:', error);
    res.status(500).json({ error: 'Failed to create bubble' });
  }
});

// API: Vote on a bubble
app.post('/api/bubbles/:id/vote', (req, res) => {
  try {
    const { id } = req.params;
    const { vote } = req.body; // 1 for upvote, -1 for downvote
    const fingerprint = getFingerprint(req);
    
    if (vote !== 1 && vote !== -1) {
      return res.status(400).json({ error: 'Invalid vote' });
    }

    const bubble = dbGet('SELECT * FROM bubbles WHERE id = ?', [id]);
    if (!bubble) {
      return res.status(404).json({ error: 'Bubble not found' });
    }

    // Check if same user trying to vote on their own bubble
    if (bubble.creator_fingerprint === fingerprint) {
      return res.status(403).json({ error: 'Cannot vote on your own bubble' });
    }

    // Check existing vote
    const existingVote = dbGet('SELECT vote FROM votes WHERE bubble_id = ? AND fingerprint = ?', [id, fingerprint]);
    let scoreDelta = vote;
    
    if (existingVote) {
      if (existingVote.vote === vote) {
        // Already voted the same way
        return res.status(400).json({ error: 'Already voted', currentVote: vote });
      }
      // Changing vote: need to reverse previous vote + add new one
      scoreDelta = vote * 2;
      // Update existing vote
      dbRun('UPDATE votes SET vote = ? WHERE bubble_id = ? AND fingerprint = ?', [vote, id, fingerprint]);
    } else {
      // Insert new vote
      dbRun('INSERT INTO votes (bubble_id, fingerprint, vote) VALUES (?, ?, ?)', [id, fingerprint, vote]);
    }

    // Update bubble score and interaction time
    const now = Date.now();
    dbRun('UPDATE bubbles SET score = score + ?, last_interaction = ? WHERE id = ?', [scoreDelta, now, id]);
    
    const updatedBubble = dbGet('SELECT * FROM bubbles WHERE id = ?', [id]);
    
    // Broadcast update to all clients
    broadcast({ type: 'update_bubble', bubble: updatedBubble });
    
    res.json({ success: true, newScore: updatedBubble.score, yourVote: vote });
  } catch (error) {
    console.error('Error voting:', error);
    res.status(500).json({ error: 'Failed to vote' });
  }
});

// API: Get user's vote on a bubble
app.get('/api/bubbles/:id/vote', (req, res) => {
  const { id } = req.params;
  const fingerprint = getFingerprint(req);
  const existingVote = dbGet('SELECT vote FROM votes WHERE bubble_id = ? AND fingerprint = ?', [id, fingerprint]);
  res.json({ vote: existingVote ? existingVote.vote : 0 });
});

// ===========================================
// SUGGESTIONS API
// ===========================================

// Get all suggestions (sorted by votes)
app.get('/api/suggestions', (req, res) => {
  try {
    const suggestions = dbAll('SELECT * FROM suggestions ORDER BY votes DESC, created_at DESC');
    res.json(suggestions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// Create a suggestion
app.post('/api/suggestions', (req, res) => {
  try {
    const { title, description } = req.body;
    const fingerprint = getFingerprint(req);
    
    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    const id = uuidv4();
    const now = Date.now();
    
    dbRun(
      'INSERT INTO suggestions (id, title, description, votes, created_at, creator_fingerprint) VALUES (?, ?, ?, 0, ?, ?)',
      [id, title.trim(), description ? description.trim() : null, now, fingerprint]
    );
    
    const newSuggestion = dbGet('SELECT * FROM suggestions WHERE id = ?', [id]);
    broadcast({ type: 'new_suggestion', suggestion: newSuggestion });
    
    res.json(newSuggestion);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create suggestion' });
  }
});

// Vote on a suggestion (toggle)
app.post('/api/suggestions/:id/vote', (req, res) => {
  try {
    const { id } = req.params;
    const fingerprint = getFingerprint(req);
    
    const suggestion = dbGet('SELECT * FROM suggestions WHERE id = ?', [id]);
    if (!suggestion) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }
    
    // Check if already voted
    const existingVote = dbGet('SELECT * FROM suggestion_votes WHERE suggestion_id = ? AND fingerprint = ?', [id, fingerprint]);
    
    if (existingVote) {
      // Remove vote
      dbRun('DELETE FROM suggestion_votes WHERE suggestion_id = ? AND fingerprint = ?', [id, fingerprint]);
      dbRun('UPDATE suggestions SET votes = votes - 1 WHERE id = ?', [id]);
    } else {
      // Add vote
      dbRun('INSERT INTO suggestion_votes (suggestion_id, fingerprint) VALUES (?, ?)', [id, fingerprint]);
      dbRun('UPDATE suggestions SET votes = votes + 1 WHERE id = ?', [id]);
    }
    
    const updatedSuggestion = dbGet('SELECT * FROM suggestions WHERE id = ?', [id]);
    broadcast({ type: 'update_suggestion', suggestion: updatedSuggestion });
    
    res.json({ success: true, votes: updatedSuggestion.votes, voted: !existingVote });
  } catch (error) {
    res.status(500).json({ error: 'Failed to vote' });
  }
});

// Check if user voted on a suggestion
app.get('/api/suggestions/:id/vote', (req, res) => {
  const { id } = req.params;
  const fingerprint = getFingerprint(req);
  const voted = dbGet('SELECT * FROM suggestion_votes WHERE suggestion_id = ? AND fingerprint = ?', [id, fingerprint]);
  res.json({ voted: !!voted });
});

// Cleanup old bubbles periodically (runs every 5 minutes)
setInterval(() => {
  if (!db) return;
  const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
  const now = Date.now();
  
  // Clean up old user bubbles (not interacted with in 24h)
  const oldBubbles = dbAll('SELECT id FROM bubbles WHERE bot_source IS NULL AND last_interaction < ?', [cutoff]);
  
  // Clean up past bot events
  const pastEvents = dbAll('SELECT id FROM bubbles WHERE bot_source IS NOT NULL AND event_end_date IS NOT NULL AND event_end_date < ?', [now]);
  
  if (oldBubbles.length > 0 || pastEvents.length > 0) {
    // Delete old user bubbles
    dbRun('DELETE FROM bubbles WHERE bot_source IS NULL AND last_interaction < ?', [cutoff]);
    // Delete past bot events
    dbRun('DELETE FROM bubbles WHERE bot_source IS NOT NULL AND event_end_date IS NOT NULL AND event_end_date < ?', [now]);
    // Clean up orphaned votes
    dbRun('DELETE FROM votes WHERE bubble_id NOT IN (SELECT id FROM bubbles)');
    broadcast({ type: 'cleanup' });
    console.log(`🧹 Cleaned up ${oldBubbles.length} old user bubbles, ${pastEvents.length} past events`);
  }
}, 5 * 60 * 1000);

// Broadcast decay updates every 30 seconds
setInterval(() => {
  broadcast({ type: 'decay_tick' });
}, 30 * 1000);

// ===========================================
// BOT SCRAPERS
// ===========================================
async function importBotEvents(events, source) {
  let imported = 0;
  const now = Date.now();
  
  for (const event of events) {
    try {
      // Check if already exists (by title + similar location)
      const existing = dbAll(
        `SELECT id FROM bubbles WHERE 
         title = ? AND 
         ABS(lat - ?) < 0.001 AND 
         ABS(lng - ?) < 0.001 AND
         bot_source = ?`,
        [event.title, event.lat, event.lng, source]
      );
      
      if (existing.length > 0) {
        continue; // Skip duplicate
      }
      
      const id = uuidv4();
      dbRun(
        `INSERT INTO bubbles (id, lat, lng, title, caption, media_url, media_type, score, created_at, last_interaction, creator_fingerprint, bot_source, event_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
        [id, event.lat, event.lng, event.title, event.caption || '', event.media_url || null, null, now, now, 'bot', source, event.event_url || null]
      );
      
      const bubble = dbGet('SELECT * FROM bubbles WHERE id = ?', [id]);
      broadcast({ type: 'new_bubble', bubble });
      imported++;
      
    } catch (error) {
      console.error('Error importing event:', event.title, error);
    }
  }
  
  return imported;
}

async function runScrapers() {
  console.log('🤖 Running scrapers...');
  await populateBotBubbles();
}

// API: Manual trigger for scrapers (for testing)
app.post('/api/scrape', async (req, res) => {
  try {
    await runScrapers();
    res.json({ success: true, message: 'Scrapers executed' });
  } catch (error) {
    res.status(500).json({ error: 'Scraper failed' });
  }
});

// API: Cleanup bubbles far from Amsterdam (remove test data)
app.post('/api/cleanup', (req, res) => {
  try {
    // Amsterdam center
    const centerLat = 52.3676;
    const centerLng = 4.9041;
    const maxDistanceKm = 50; // Keep bubbles within 50km of Amsterdam
    
    const allBubbles = dbAll('SELECT id, lat, lng, title FROM bubbles WHERE bot_source IS NULL');
    let deleted = 0;
    
    allBubbles.forEach(bubble => {
      const distance = calculateDistance(centerLat, centerLng, bubble.lat, bubble.lng);
      if (distance > maxDistanceKm) {
        dbRun('DELETE FROM bubbles WHERE id = ?', [bubble.id]);
        dbRun('DELETE FROM votes WHERE bubble_id = ?', [bubble.id]);
        deleted++;
        console.log(`🗑️  Removed distant bubble: ${bubble.title} (${distance.toFixed(0)}km away)`);
      }
    });
    
    broadcast({ type: 'cleanup' });
    res.json({ success: true, deleted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// SUGGESTION SYSTEM
// ===========================================

// API: Get all suggestions
app.get('/api/suggestions', (req, res) => {
  try {
    const suggestions = dbAll('SELECT * FROM suggestions ORDER BY upvotes DESC, created_at DESC');
    res.json(suggestions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Create suggestion
app.post('/api/suggestions', (req, res) => {
  try {
    const { title, description } = req.body;
    const fingerprint = getFingerprint(req);
    
    if (!title || title.length < 5) {
      return res.status(400).json({ error: 'Title too short' });
    }
    
    const id = uuidv4();
    const now = Date.now();
    
    dbRun(
      'INSERT INTO suggestions (id, title, description, upvotes, created_at, creator_fingerprint) VALUES (?, ?, ?, 0, ?, ?)',
      [id, title, description || '', now, fingerprint]
    );
    
    res.json({ success: true, id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Upvote suggestion
app.post('/api/suggestions/:id/upvote', (req, res) => {
  try {
    const { id } = req.params;
    const fingerprint = getFingerprint(req);
    
    // Check if already voted
    const existingVote = dbGet(
      'SELECT * FROM suggestion_votes WHERE suggestion_id = ? AND fingerprint = ?',
      [id, fingerprint]
    );
    
    if (existingVote) {
      return res.status(400).json({ error: 'Already voted' });
    }
    
    // Add vote
    dbRun('INSERT INTO suggestion_votes (suggestion_id, fingerprint) VALUES (?, ?)', [id, fingerprint]);
    dbRun('UPDATE suggestions SET upvotes = upvotes + 1 WHERE id = ?', [id]);
    
    const suggestion = dbGet('SELECT * FROM suggestions WHERE id = ?', [id]);
    res.json({ success: true, upvotes: suggestion.upvotes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Check if user voted on suggestion
app.get('/api/suggestions/:id/vote', (req, res) => {
  try {
    const { id } = req.params;
    const fingerprint = getFingerprint(req);
    const vote = dbGet('SELECT * FROM suggestion_votes WHERE suggestion_id = ? AND fingerprint = ?', [id, fingerprint]);
    res.json({ voted: !!vote });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Run scrapers every 30 minutes
setInterval(runScrapers, 30 * 60 * 1000);

// Run scrapers on startup (after a delay to let DB init)
setTimeout(runScrapers, 5000);

// Auto-populate bot bubbles
async function populateBotBubbles() {
  const { searchEventbrite } = require('./scrapers/amsterdam-events');
  const { searchStudentEvents } = require('./scrapers/student-events');
  const { searchCommunityEvents } = require('./scrapers/community-events');
  
  try {
    // Gather events from all sources
    const [eventbriteEvents, studentEvents, communityEvents] = await Promise.all([
      searchEventbrite(),
      searchStudentEvents(),
      searchCommunityEvents()
    ]);
    
    const allEvents = [...eventbriteEvents, ...studentEvents, ...communityEvents];
    const now = Date.now();
    let added = 0;
    
    for (const event of allEvents) {
      // Check if event already exists (by title + location)
      const existing = dbGet(
        'SELECT id FROM bubbles WHERE title = ? AND lat = ? AND lng = ? AND bot_source IS NOT NULL',
        [event.title, event.lat, event.lng]
      );
      
      if (!existing) {
        const id = uuidv4();
        dbRun(
          `INSERT INTO bubbles (id, lat, lng, title, caption, media_url, media_type, score, created_at, last_interaction, creator_fingerprint, bot_source, event_url, event_date, event_end_date)
           VALUES (?, ?, ?, ?, ?, NULL, NULL, 0, ?, ?, 'bot', ?, ?, ?, ?)`,
          [id, event.lat, event.lng, event.title, event.caption, now, now, event.bot_source, event.event_url, event.event_date || null, event.event_end_date || null]
        );
        console.log(`🤖 Added ${event.bot_source} event: ${event.title}`);
        added++;
      }
    }
    
    console.log(`✅ Added ${added} new events`);
    
    // Broadcast to all clients to refresh
    broadcast({ type: 'cleanup' });
  } catch (error) {
    console.error('Error populating bot bubbles:', error);
  }
}

const PORT = process.env.PORT || 3000;

// Start server after database is initialized
initDatabase().then(async () => {
  server.listen(PORT, async () => {
    console.log(`🗺️  TheWhereWhat running at http://localhost:${PORT}`);
    
    // Clear old bot bubbles with bad coordinates
    dbRun('DELETE FROM bubbles WHERE bot_source IS NOT NULL');
    console.log('🗑️  Cleared old bot bubbles');
    
    // Pre-geocode all venues on first startup (takes ~1-2 minutes)
    console.log('🌍 Geocoding all venues...');
    const eventbriteVenues = require('./scrapers/amsterdam-events');
    const studentVenues = require('./scrapers/student-events');
    const communityVenues = require('./scrapers/community-events');
    
    await Promise.all([
      eventbriteVenues.ensureVenuesGeocoded(),
      studentVenues.ensureVenuesGeocoded(),
      communityVenues.ensureVenuesGeocoded()
    ]);
    
    console.log('✅ All venues geocoded!');
    
    // Populate bot bubbles with real coordinates
    await populateBotBubbles();
    
    // Refresh bot bubbles every 6 hours
    setInterval(populateBotBubbles, 6 * 60 * 60 * 1000);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
