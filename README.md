# TheWhereWhat (TWW) 🗺️

Real-time map showing what's happening around you. Think Google Maps + Reddit + Snapchat Map.

Users post "bubbles" about events (concerts, meetups, incidents) which others can upvote/downvote. Bubbles grow with upvotes and fade away over time.

## Features

✨ **No login required** - Post and interact anonymously  
🗺️ **Real-time updates** - WebSocket-powered live map  
🎯 **Smart voting** - Device fingerprinting prevents spam  
🤖 **Auto-populated events** - Bot scrapes events from multiple sources  
📍 **Accurate locations** - Geocoded using OpenStreetMap  
🎨 **Color-coded bubbles**:
- 🟣 Purple = Eventbrite events
- 🔵 Blue = Student events  
- 🟢 Green = Community events
- 🔴 Pink = Hot posts (10+ upvotes)
- 💙 Cyan = User posts
- ⚫ Gray = Cold posts (-3 downvotes)

## Tech Stack

- **Backend**: Node.js, Express, WebSocket
- **Database**: SQLite (via sql.js)
- **Frontend**: Vanilla JS, Leaflet.js
- **Map tiles**: CartoDB Dark
- **Geocoding**: OpenStreetMap Nominatim (free, no API key)

## Installation

```bash
# Clone the repo
git clone <your-repo-url>
cd tww

# Install dependencies
npm install

# Start server
node server.js
```

Server runs on `http://localhost:3000`

## Configuration

### Port
Change port in `server.js`:
```javascript
const PORT = process.env.PORT || 3000;
```

### Event Sources
Bot events are automatically populated from:
- `scrapers/amsterdam-events.js` - Eventbrite-style events
- `scrapers/student-events.js` - University/student events
- `scrapers/community-events.js` - Meetups and community events

Venues are auto-geocoded on first run (~1-2 minutes).

### Add Real API Keys
Replace mock data in scrapers with real APIs:
- **Eventbrite**: https://www.eventbrite.com/platform/api
- **Meetup**: https://www.meetup.com/api/
- **Ticketmaster**: https://developer.ticketmaster.com/

## Deployment (VPS)

### 1. Server Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Install nginx for reverse proxy
sudo apt install -y nginx
```

### 2. Upload Code
```bash
# On your local machine
git push origin main

# On VPS
cd /var/www
sudo git clone <your-repo-url> tww
cd tww
sudo npm install
```

### 3. Configure PM2
```bash
# Start with PM2
pm2 start server.js --name tww

# Auto-start on reboot
pm2 startup
pm2 save
```

### 4. Nginx Reverse Proxy
```bash
sudo nano /etc/nginx/sites-available/tww
```

Add:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/tww /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 5. SSL (Optional but Recommended)
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## Usage

### Debug Mode
Test with multiple "users" by adding `?fp=username` to URL:
```
http://localhost:3000/?fp=alice
http://localhost:3000/?fp=bob
```

### Interactions
- **Double-tap map** to post a bubble
- **Double-tap bubble** to view details
- **Upvote/downvote** to affect bubble size
- Bubbles fade after 24h of no interaction
- Bot events auto-expire when event ends

## API Endpoints

- `GET /api/bubbles` - Get all active bubbles
- `POST /api/bubbles` - Create a bubble
- `POST /api/bubbles/:id/vote` - Vote on a bubble
- `GET /api/bubbles/:id/vote` - Get user's vote
- `POST /api/scrape` - Manually trigger event scrapers (dev only)
- `POST /api/cleanup` - Remove distant bubbles (dev only)

## License

MIT

## Contributing

1. Add more event scrapers in `/scrapers`
2. Improve geocoding accuracy
3. Add more venue locations
4. Optimize bubble rendering for mobile

---

Built with ❤️ for real-time local discovery
