// backend/routes/tracking.js
const router = require('express').Router();
const db     = require('../database/db');
const auth   = require('../middleware/auth');

// In-memory tracking state (use Redis in production for multi-instance)
const busLocations = new Map();

// Simulate bus movement along route stops
const simulateMovement = () => {
  const activeTrips = db.prepare(
    `SELECT t.id, t.bus_id, t.route_id, t.current_stop, t.status, t.departure_time
     FROM trips t
     WHERE t.status IN ('boarding','in_transit','scheduled')
     AND t.departure_time <= datetime('now', '+30 minutes')`
  ).all();

  activeTrips.forEach(trip => {
    const stops = db.prepare(
      'SELECT * FROM route_stops WHERE route_id=? ORDER BY stop_order'
    ).all(trip.route_id);

    if (!stops.length) return;

    let state = busLocations.get(trip.id);
    if (!state) {
      state = { stopIndex: 0, progress: 0, lat: stops[0].lat, lng: stops[0].lng };
      busLocations.set(trip.id, state);
    }

    const currentStop = stops[state.stopIndex];
    const nextStop    = stops[state.stopIndex + 1];

    if (!nextStop) {
      // Reached final stop
      db.prepare(`UPDATE trips SET status='completed' WHERE id=?`).run(trip.id);
      busLocations.delete(trip.id);
      return;
    }

    // Interpolate between current and next stop (progress 0→1 over ~90s per segment)
    state.progress = Math.min(1, state.progress + 0.018);
    state.lat = currentStop.lat + (nextStop.lat - currentStop.lat) * state.progress;
    state.lng = currentStop.lng + (nextStop.lng - currentStop.lng) * state.progress;

    // Small random jitter to simulate GPS noise
    state.lat += (Math.random() - 0.5) * 0.0002;
    state.lng += (Math.random() - 0.5) * 0.0002;

    if (state.progress >= 1) {
      state.stopIndex++;
      state.progress = 0;
      db.prepare(`UPDATE trips SET current_lat=?, current_lng=?, current_stop=?, status='in_transit' WHERE id=?`).run(
        state.lat, state.lng, state.stopIndex, trip.id
      );
    } else {
      db.prepare(`UPDATE trips SET current_lat=?, current_lng=?, status='in_transit' WHERE id=?`).run(
        state.lat, state.lng, trip.id
      );
    }
  });
};

// Run simulation every 3 seconds
setInterval(simulateMovement, 3000);

// GET /api/tracking/:tripId — current position of a trip
router.get('/:tripId', (req, res) => {
  const trip = db.prepare(`
    SELECT t.id, t.bus_id, t.route_id, t.status, t.current_lat, t.current_lng, t.current_stop,
           t.departure_time, t.arrival_time,
           r.name AS route_name, r.origin, r.destination,
           b.plate_no, b.model, b.bus_type,
           op.company_name AS operator
    FROM trips t
    JOIN routes r ON t.route_id = r.id
    JOIN buses b ON t.bus_id = b.id
    JOIN operators op ON b.operator_id = op.id
    WHERE t.id=?
  `).get(req.params.tripId);

  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  const stops = db.prepare(
    'SELECT * FROM route_stops WHERE route_id=? ORDER BY stop_order'
  ).all(trip.route_id);

  const state = busLocations.get(trip.id);
  const currentStopIdx = state ? state.stopIndex : (trip.current_stop || 0);
  const nextStop = stops[currentStopIdx + 1];

  // Calculate ETA to next stop
  const etaSeconds = state ? Math.round((1 - state.progress) * 90) : null;

  res.json({
    trip_id: trip.id,
    status: trip.status,
    current: {
      lat: state?.lat ?? trip.current_lat,
      lng: state?.lng ?? trip.current_lng,
    },
    current_stop: stops[currentStopIdx]?.stop_name || trip.origin,
    next_stop: nextStop?.stop_name || null,
    eta_seconds: etaSeconds,
    eta_minutes: etaSeconds ? Math.ceil(etaSeconds / 60) : null,
    destination: trip.destination,
    route_name: trip.route_name,
    plate_no: trip.plate_no,
    bus_type: trip.bus_type,
    operator: trip.operator,
    departure_time: trip.departure_time,
    arrival_time: trip.arrival_time,
    stops,
  });
});

// GET /api/tracking/map/:routeId — all active buses on a route
router.get('/map/:routeId', (req, res) => {
  const activeTrips = db.prepare(`
    SELECT t.id, t.bus_id, t.status, t.current_lat, t.current_lng, t.current_stop,
           b.plate_no, b.bus_type
    FROM trips t
    JOIN buses b ON t.bus_id = b.id
    WHERE t.route_id=? AND t.status IN ('boarding','in_transit')
  `).all(req.params.routeId);

  const buses = activeTrips.map(t => {
    const state = busLocations.get(t.id);
    return {
      trip_id: t.id,
      plate_no: t.plate_no,
      bus_type: t.bus_type,
      status: t.status,
      lat: state?.lat ?? t.current_lat,
      lng: state?.lng ?? t.current_lng,
    };
  });

  const stops = db.prepare(
    'SELECT * FROM route_stops WHERE route_id=? ORDER BY stop_order'
  ).all(req.params.routeId);

  res.json({ buses, stops });
});

module.exports = router;
