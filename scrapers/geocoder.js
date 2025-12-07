const https = require('https');

// Cache geocoded locations to avoid repeated requests
const geocodeCache = new Map();

/**
 * Geocode a venue name in Amsterdam using OpenStreetMap Nominatim
 * Free service, no API key required, but rate limited to 1 req/sec
 */
async function geocodeVenue(venueName, city = 'Amsterdam') {
  const cacheKey = `${venueName}, ${city}`;
  
  // Check cache first
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey);
  }
  
  // OpenStreetMap Nominatim API
  const query = encodeURIComponent(`${venueName}, ${city}, Netherlands`);
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;
  
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'TheWhereWhat/1.0' // Nominatim requires a user agent
      }
    };
    
    https.get(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const results = JSON.parse(data);
          
          if (results && results.length > 0) {
            const location = {
              lat: parseFloat(results[0].lat),
              lng: parseFloat(results[0].lon),
              display_name: results[0].display_name
            };
            
            // Cache it
            geocodeCache.set(cacheKey, location);
            console.log(`📍 Geocoded: ${venueName} → ${location.lat}, ${location.lng}`);
            
            resolve(location);
          } else {
            console.warn(`⚠️  No location found for: ${venueName}`);
            resolve(null);
          }
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Geocode multiple venues with rate limiting (1 req/sec for Nominatim)
 */
async function geocodeVenues(venueNames, city = 'Amsterdam') {
  const results = [];
  
  for (const venueName of venueNames) {
    try {
      const location = await geocodeVenue(venueName, city);
      if (location) {
        results.push({
          name: venueName,
          ...location
        });
      }
      
      // Rate limit: wait 1 second between requests
      await new Promise(resolve => setTimeout(resolve, 1100));
    } catch (error) {
      console.error(`Error geocoding ${venueName}:`, error.message);
    }
  }
  
  return results;
}

module.exports = { geocodeVenue, geocodeVenues };

