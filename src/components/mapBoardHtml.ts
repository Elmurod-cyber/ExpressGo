import { SHAHRIXON } from "../services/geo";

export const MAP_BOARD_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; background: #e8eef5; }
    .leaflet-control-attribution { font-size: 10px; }
    .pin-name {
      background: rgba(255,255,255,0.94);
      border: 0;
      border-radius: 8px;
      box-shadow: none;
      color: #101828;
      font: 700 11px/1.2 sans-serif;
      padding: 2px 6px;
    }
    .pin-name:before { display: none; }
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
    let layer = L.layerGroup().addTo(map);
    function colorFor(tone) {
      if (tone === 'busy') return '#155EEF';
      if (tone === 'free') return '#12B76A';
      return '#F5A524';
    }
    function setPins(input) {
      const pins = Array.isArray(input) ? input : (input && input.pins) || [];
      layer.clearLayers();
      const bounds = [];
      (pins || []).forEach(function (pin) {
        if (typeof pin.lat !== 'number' || typeof pin.lng !== 'number') return;
        const marker = L.circleMarker([pin.lat, pin.lng], {
          radius: pin.kind === 'courier' ? 9 : 11,
          color: '#ffffff',
          weight: 2,
          fillColor: colorFor(pin.tone),
          fillOpacity: 1
        });
        if (pin.label) marker.bindTooltip(pin.label, { permanent: true, direction: 'top', offset: [0, -8], className: 'pin-name', opacity: 1 });
        layer.addLayer(marker);
        bounds.push([pin.lat, pin.lng]);
      });
      if (bounds.length === 1) map.setView(bounds[0], 15, { animate: false });
      else if (bounds.length > 1) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16, animate: false });
    }
    window.setPins = setPins;
    function readPins(raw) {
      try {
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (data && Array.isArray(data.pins)) setPins(data.pins);
      } catch (err) {}
    }
    window.addEventListener('message', function (event) { readPins(event.data); });
    document.addEventListener('message', function (event) { readPins(event.data); });
  </script>
</body>
</html>`;
