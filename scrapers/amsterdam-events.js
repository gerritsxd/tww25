const { geocodeVenue } = require('./geocoder');

// Popular Amsterdam venues (will be geocoded on first run)
const VENUE_NAMES = [
  'Paradiso Amsterdam',
  'Melkweg Amsterdam',
  'De School Amsterdam',
  'AFAS Live Amsterdam',
  'Muziekgebouw aan \'t IJ Amsterdam',
  'Ziggo Dome Amsterdam',
  'Tolhuistuin Amsterdam',
  'Wonzimer Amsterdam',
  'De Marktkantine Amsterdam',
  'Canvas Amsterdam',
  'Shelter Amsterdam',
  'Claire Amsterdam',
  'Radion Amsterdam',
  'De Nieuwe Anita Amsterdam',
  'OT301 Amsterdam',
  'Bitterzoet Amsterdam',
  'AIR Amsterdam',
  'Chicago Social Club Amsterdam',
  'Chin Chin Club Amsterdam',
  'De Duivel Amsterdam'
];

const EVENT_TYPES = [
  'Live Music',
  'DJ Set',
  'Techno Night',
  'Jazz Session',
  'Stand-up Comedy',
  'Art Exhibition',
  'Food Market',
  'Meetup',
  'Workshop',
  'Film Screening',
  'Poetry Slam',
  'Open Mic Night',
  'Dance Performance',
  'Indie Concert',
  'Hip Hop Night'
];

// Cache geocoded venues
let geocodedVenues = [];
let isGeocoding = false;

async function ensureVenuesGeocoded() {
  if (geocodedVenues.length > 0 || isGeocoding) {
    return geocodedVenues;
  }
  
  isGeocoding = true;
  console.log('🔍 Geocoding Amsterdam venues (this will take ~30 seconds)...');
  
  for (const venueName of VENUE_NAMES) {
    try {
      const location = await geocodeVenue(venueName, 'Amsterdam');
      if (location) {
        geocodedVenues.push({
          name: venueName.replace(' Amsterdam', ''),
          lat: location.lat,
          lng: location.lng
        });
      }
      
      // Rate limit: 1 request per second for Nominatim
      await new Promise(resolve => setTimeout(resolve, 1100));
    } catch (error) {
      console.error(`Failed to geocode ${venueName}:`, error.message);
    }
  }
  
  console.log(`✅ Geocoded ${geocodedVenues.length} venues`);
  isGeocoding = false;
  return geocodedVenues;
}

function getRandomVenue(venues) {
  if (venues.length === 0) return null;
  return venues[Math.floor(Math.random() * venues.length)];
}

function getRandomEventType() {
  return EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
}

// Generate mock events with real geocoded coordinates
async function generateMockEvents(count = 10) {
  const venues = await ensureVenuesGeocoded();
  
  if (venues.length === 0) {
    console.warn('⚠️  No venues geocoded yet, skipping event generation');
    return [];
  }
  
  const events = [];
  const now = Date.now();
  const usedVenues = new Set();
  
  for (let i = 0; i < count && usedVenues.size < venues.length; i++) {
    const venue = getRandomVenue(venues);
    if (!venue) continue;
    
    // Skip if we already have an event at this venue (limit 1 per venue)
    const venueKey = `${venue.lat},${venue.lng}`;
    if (usedVenues.has(venueKey)) {
      continue;
    }
    usedVenues.add(venueKey);
    
    const eventType = getRandomEventType();
    
    // Generate event date: random time in next 7 days
    const hoursFromNow = Math.random() * 7 * 24; // 0-7 days
    const eventStart = now + (hoursFromNow * 60 * 60 * 1000);
    const eventDuration = (2 + Math.random() * 6) * 60 * 60 * 1000; // 2-8 hours
    const eventEnd = eventStart + eventDuration;
    
    // Add small random offset (±20 meters) so multiple events at same venue don't stack
    const latOffset = (Math.random() - 0.5) * 0.0002;
    const lngOffset = (Math.random() - 0.5) * 0.0002;
    
    const startDate = new Date(eventStart);
    const timeStr = startDate.toLocaleString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    events.push({
      title: `${eventType} @ ${venue.name}`,
      caption: `${timeStr} • Upcoming event in Amsterdam`,
      lat: venue.lat + latOffset,
      lng: venue.lng + lngOffset,
      bot_source: 'eventbrite',
      event_url: `https://www.eventbrite.com/`,
      created_at: now,
      event_date: eventStart,
      event_end_date: eventEnd
    });
  }
  
  return events;
}

// TODO: Real Eventbrite API implementation
async function searchEventbrite() {
  // For now, return mock data with REAL geocoded coordinates
  // In production, call real API:
  // const response = await fetch(`https://www.eventbriteapi.com/v3/events/search/?location.latitude=${lat}&location.longitude=${lng}...`);
  
  return generateMockEvents(15);
}

module.exports = { searchEventbrite, ensureVenuesGeocoded };
