const https = require('https');

// Eventbrite public event search
// Note: For production, get a proper API key from https://www.eventbrite.com/platform/api
// For now, we'll scrape their public search page

async function searchEventbriteAmsterdam() {
  // Amsterdam coordinates
  const lat = 52.3676;
  const lng = 4.9041;
  const radiusKm = 15;

  // Eventbrite search URL (public events)
  const searchUrl = `https://www.eventbrite.com/d/netherlands--amsterdam/events/`;

  return new Promise((resolve, reject) => {
    https.get(searchUrl, (res) => {
      let data = '';
      
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const events = parseEventbritePage(data, lat, lng, radiusKm);
        resolve(events);
      });
    }).on('error', reject);
  });
}

function parseEventbritePage(html, centerLat, centerLng, radiusKm) {
  const events = [];
  
  // Simple regex to extract event data from HTML
  // This is fragile and might break - proper API is better for production
  const titleRegex = /"name":"([^"]+)"/g;
  const locationRegex = /"latitude":"([^"]+)","longitude":"([^"]+)"/g;
  const urlRegex = /"url":"(https:\/\/www\.eventbrite\.com\/e\/[^"]+)"/g;
  
  let match;
  const titles = [];
  const locations = [];
  const urls = [];
  
  while ((match = titleRegex.exec(html)) !== null) {
    titles.push(match[1]);
  }
  
  while ((match = locationRegex.exec(html)) !== null) {
    locations.push({ lat: parseFloat(match[1]), lng: parseFloat(match[2]) });
  }
  
  while ((match = urlRegex.exec(html)) !== null) {
    urls.push(match[1]);
  }
  
  // Match them up (this is crude, real API gives structured data)
  const minLength = Math.min(titles.length, locations.length, urls.length);
  
  for (let i = 0; i < minLength; i++) {
    // Check if within radius
    const distance = calculateDistance(centerLat, centerLng, locations[i].lat, locations[i].lng);
    
    if (distance <= radiusKm) {
      events.push({
        title: cleanTitle(titles[i]),
        lat: locations[i].lat,
        lng: locations[i].lng,
        caption: `Event found on Eventbrite`,
        event_url: urls[i],
        bot_source: 'eventbrite'
      });
    }
  }
  
  return events.slice(0, 20); // Limit to 20 events
}

function cleanTitle(title) {
  // Remove HTML entities, truncate if too long
  return title
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .slice(0, 100);
}

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

module.exports = { searchEventbriteAmsterdam };
