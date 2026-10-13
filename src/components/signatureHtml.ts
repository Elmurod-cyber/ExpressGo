export const SIGNATURE_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    html, body { margin: 0; height: 100%; background: #ffffff; overflow: hidden; }
    canvas { display: block; width: 100%; height: 100%; touch-action: none; }
  </style>
</head>
<body>
  <canvas id="c"></canvas>
  <script>
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    let drawing = false;

    function fit() {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * ratio;
      canvas.height = canvas.clientHeight * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      ctx.strokeStyle = '#101828';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }

    function point(event) {
      const source = event.touches ? event.touches[0] : event;
      const box = canvas.getBoundingClientRect();
      return { x: source.clientX - box.left, y: source.clientY - box.top };
    }

    function start(event) {
      event.preventDefault();
      drawing = true;
      const next = point(event);
      ctx.beginPath();
      ctx.moveTo(next.x, next.y);
    }

    function move(event) {
      if (!drawing) return;
      event.preventDefault();
      const next = point(event);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
    }

    function end() {
      drawing = false;
    }

    function send(payload) {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
      if (window.parent && window.parent !== window) window.parent.postMessage(payload, '*');
    }

    window.clearPad = function () {
      fit();
    };

    window.sendPad = function () {
      send(canvas.toDataURL('image/png'));
    };

    window.addEventListener('message', function (event) {
      if (event.data === 'clear') window.clearPad();
      if (event.data === 'save') window.sendPad();
    });

    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    window.addEventListener('resize', fit);
    fit();
  </script>
</body>
</html>`;
