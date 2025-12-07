const { geocodeVenue } = require('./geocoder');

// Community spaces and meetup venues in Amsterdam
const COMMUNITY_VENUES = [
  'Impact Hub Amsterdam',
  'Spaces Vijzelstraat Amsterdam',
  'B. Amsterdam',
  'Volkshotel Amsterdam',
  'A Lab Amsterdam',
  'De Ceuvel Amsterdam',
  'Mediamatic Amsterdam',
  'Het HEM Amsterdam',
  'Pllek Amsterdam',
  'Ndsm Wharf Amsterdam',
  'Foodhallen Amsterdam',
  'Westergasfabriek Amsterdam'
];

const COMMUNITY_EVENT_TYPES = [
  'Tech Meetup',
  'Startup Pitch Night',
  'Yoga Session',
  'Meditation Circle',
  'Cooking Workshop',
  'Photography Walk',
  'Book Club',
  'Running Club',
  'Chess Meetup',
  'Boardgame Cafe',
  'Knitting Circle',
  'Language Cafe',
  'Improv Workshop',
  'Bitcoin Meetup',
  'Sustainability Talk'
];

let geocodedVenues = [];
let isGeocoding = false;

async function ensureVenuesGeocoded() {
  if (geocodedVenues.length > 0 || isGeocoding) {
    return geocodedVenues;
  }
  
  isGeocoding = true;
  console.log('🤝 Geocoding community venues...');
  
  for (const venueName of COMMUNITY_VENUES) {
    try {
      const location = await geocodeVenue(venueName, 'Amsterdam');
      if (location) {
        geocodedVenues.push({
          name: venueName.replace(' Amsterdam', ''),
          lat: location.lat,
          lng: location.lng
        });
      }
      await new Promise(resolve => setTimeout(resolve, 1100));
    } catch (error) {
      console.error(`Failed to geocode ${venueName}:`, error.message);
    }
  }
  
  console.log(`✅ Geocoded ${geocodedVenues.length} community venues`);
  isGeocoding = false;
  return geocodedVenues;
}

function getRandomVenue(venues) {
  if (venues.length === 0) return null;
  return venues[Math.floor(Math.random() * venues.length)];
}

function getRandomEventType() {
  return COMMUNITY_EVENT_TYPES[Math.floor(Math.random() * COMMUNITY_EVENT_TYPES.length)];
}

async function generateCommunityEvents(count = 8) {
  const venues = await ensureVenuesGeocoded();
  
  if (venues.length === 0) {
    console.warn('⚠️  No community venues geocoded yet');
    return [];
  }
  
  const events = [];
  const now = Date.now();
  const usedVenues = new Set();
  
  for (let i = 0; i < count && usedVenues.size < venues.length; i++) {
    const venue = getRandomVenue(venues);
    if (!venue) continue;
    
    const venueKey = `${venue.lat},${venue.lng}`;
    if (usedVenues.has(venueKey)) {
      continue;
    }
    usedVenues.add(venueKey);
    
    const eventType = getRandomEventType();
    
    // Community events: spread throughout next 5 days
    const hoursFromNow = Math.random() * 5 * 24;
    const eventStart = now + (hoursFromNow * 60 * 60 * 1000);
    const eventDuration = (1 + Math.random() * 3) * 60 * 60 * 1000; // 1-4 hours
    const eventEnd = eventStart + eventDuration;
    
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
      caption: `${timeStr} • Community event`,
      lat: venue.lat + latOffset,
      lng: venue.lng + lngOffset,
      bot_source: 'community',
      event_url: `https://www.meetup.com/`,
      created_at: now,
      event_date: eventStart,
      event_end_date: eventEnd
    });
  }
  
  return events;
}

async function searchCommunityEvents() {
  return generateCommunityEvents(8);
}

module.exports = { searchCommunityEvents, ensureVenuesGeocoded };

