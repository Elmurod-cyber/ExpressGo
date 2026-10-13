import { SHAHRIXON } from "../services/geo";

export const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; background: #e8eef5; }
    .leaflet-control-attribution { font-size: 10px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const start = [${SHAHRIXON.lat}, ${SHAHRIXON.lng}];
    const map = L.map('map', {
      zoomControl: true,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false
    }).setView(start, 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);
    let marker = null;
    let lineLayer = null;
    let runner = null;
    let runToken = 0;
    function ensureMarker(latlng) {
      if (marker) {
        marker.setLatLng(latlng);
        return;
      }
      marker = L.marker(latlng, { draggable: true, autoPan: true }).addTo(map);
      marker.on('dragend', function () {
        const spot = marker.getLatLng();
        send(spot.lat, spot.lng);
      });
    }
    function setPoint(lat, lng, silent) {
      const next = L.latLng(lat, lng);
      map.setView(next, Math.max(map.getZoom(), 15), { animate: false });
      ensureMarker(next);
      if (!silent) send(lat, lng);
    }
    ensureMarker(L.latLng(start[0], start[1]));
    function pointAt(path, t) {
      const parts = [];
      let total = 0;
      for (let i = 1; i < path.length; i++) {
        const d = path[i - 1].distanceTo(path[i]);
        parts.push(d);
        total += d;
      }
      if (total <= 0) return path[0];
      let walk = Math.min(1, Math.max(0, t)) * total;
      for (let i = 1; i < path.length; i++) {
        const span = parts[i - 1];
        if (walk <= span || i === path.length - 1) {
          const k = span === 0 ? 0 : Math.min(1, walk / span);
          return L.latLng(
            path[i - 1].lat + (path[i].lat - path[i - 1].lat) * k,
            path[i - 1].lng + (path[i].lng - path[i - 1].lng) * k
          );
        }
        walk -= span;
      }
      return path[path.length - 1];
    }
    function setRoute(points) {
      runToken += 1;
      const token = runToken;
      if (lineLayer) { map.removeLayer(lineLayer); lineLayer = null; }
      if (runner) { map.removeLayer(runner); runner = null; }
      if (!points || points.length < 2) return;
      const path = points.map(function (p) { return L.latLng(p.lat, p.lng); });
      lineLayer = L.polyline(path, { color: '#155EEF', weight: 4, opacity: 0.95 }).addTo(map);
      map.fitBounds(lineLayer.getBounds(), { padding: [24, 24], animate: false });
      runner = L.circleMarker(path[0], {
        radius: 7,
        color: '#012668',
        weight: 2,
        fillColor: '#1290F9',
        fillOpacity: 1
      }).addTo(map);
      const started = performance.now();
      const duration = 2800;
      function step(now) {
        if (token !== runToken || !runner) return;
        const t = Math.min(1, (now - started) / duration);
        runner.setLatLng(pointAt(path, t));
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }
    window.setPoint = setPoint;
    window.setRoute = setRoute;
    function send(lat, lng) {
      const payload = JSON.stringify({ lat: lat, lng: lng });
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
      if (window.parent && window.parent !== window) window.parent.postMessage(payload, '*');
    }
    map.on('click', function (event) {
      setPoint(event.latlng.lat, event.latlng.lng, false);
    });
    window.addEventListener('message', function (event) {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data && data.type === 'route' && Array.isArray(data.line)) setRoute(data.line);
        else if (data && typeof data.lat === 'number') setPoint(data.lat, data.lng, true);
      } catch (err) {}
    });
    document.addEventListener('message', function (event) {
      try {
        const data = JSON.parse(event.data);
        if (data && data.type === 'route' && Array.isArray(data.line)) setRoute(data.line);
        else if (data && typeof data.lat === 'number') setPoint(data.lat, data.lng, true);
      } catch (err) {}
    });
  </script>
</body>
</html>`;

export function readPoint(raw: unknown): { lat: number; lng: number } | null {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!data || typeof data !== "object") return null;
    const lat = Number((data as { lat: number }).lat);
    const lng = Number((data as { lng: number }).lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
