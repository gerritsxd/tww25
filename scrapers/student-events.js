const { geocodeVenue } = require('./geocoder');

// Amsterdam student associations and university venues
const STUDENT_VENUES = [
  'CREA Amsterdam',
  'ASVA Student Union Amsterdam',
  'USC Amsterdam',
  'VU Student Centre Amsterdam', 
  'UvA Roeterseiland Amsterdam',
  'UvA Science Park Amsterdam',
  'Pakhuis de Zwijger Amsterdam',
  'Studio K Amsterdam',
  'Mezrab Amsterdam',
  'Aula UvA Amsterdam'
];

const STUDENT_EVENT_TYPES = [
  'Study Session',
  'Student Party',
  'Board Game Night',
  'Quiz Night',
  'Pub Crawl',
  'Language Exchange',
  'Workshop',
  'Career Fair',
  'Guest Lecture',
  'Open Mic',
  'Movie Night',
  'Debate Night',
  'Networking Drinks',
  'Sports Tournament',
  'Volunteer Day'
];

// Cache geocoded venues
let geocodedVenues = [];
let isGeocoding = false;

async function ensureVenuesGeocoded() {
  if (geocodedVenues.length > 0 || isGeocoding) {
    return geocodedVenues;
  }
  
  isGeocoding = true;
  console.log('🎓 Geocoding student venues...');
  
  for (const venueName of STUDENT_VENUES) {
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
  
  console.log(`✅ Geocoded ${geocodedVenues.length} student venues`);
  isGeocoding = false;
  return geocodedVenues;
}

function getRandomVenue(venues) {
  if (venues.length === 0) return null;
  return venues[Math.floor(Math.random() * venues.length)];
}

function getRandomEventType() {
  return STUDENT_EVENT_TYPES[Math.floor(Math.random() * STUDENT_EVENT_TYPES.length)];
}

async function generateStudentEvents(count = 8) {
  const venues = await ensureVenuesGeocoded();
  
  if (venues.length === 0) {
    console.warn('⚠️  No student venues geocoded yet');
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
    
    // Student events: mostly evenings in next 3 days
    const hoursFromNow = Math.random() * 3 * 24;
    const eventStart = now + (hoursFromNow * 60 * 60 * 1000);
    const eventDuration = (1.5 + Math.random() * 4) * 60 * 60 * 1000; // 1.5-5.5 hours
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
      caption: `${timeStr} • Student event`,
      lat: venue.lat + latOffset,
      lng: venue.lng + lngOffset,
      bot_source: 'student',
      event_url: `https://www.facebook.com/events/`,
      created_at: now,
      event_date: eventStart,
      event_end_date: eventEnd
    });
  }
  
  return events;
}

async function searchStudentEvents() {
  return generateStudentEvents(8);
}

module.exports = { searchStudentEvents, ensureVenuesGeocoded };

