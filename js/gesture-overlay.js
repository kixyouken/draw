import { HAND_CONNECTIONS } from "./constants.js";
import { landmarkToPoint } from "./geometry.js";

export function createGestureOverlay({ gestureCanvas, getBrushSize }) {
  const gestureCtx = gestureCanvas.getContext("2d");

  function drawPointer(point, isPinching, tool) {
    const indicatorSize = Math.max(10, getBrushSize() * (isPinching ? 0.82 : 0.72));
    const color = tool
      ? "rgba(245,158,11,0.92)"
      : isPinching
        ? "rgba(225,29,72,0.9)"
        : "rgba(15,118,110,0.88)";

    gestureCtx.beginPath();
    gestureCtx.arc(point.x, point.y, indicatorSize, 0, Math.PI * 2);
    gestureCtx.fillStyle = color;
    gestureCtx.fill();
    gestureCtx.lineWidth = isPinching ? 4 : 3;
    gestureCtx.strokeStyle = "#ffffff";
    gestureCtx.stroke();
  }

  function draw(landmarks, point, state) {
    const rect = gestureCanvas.getBoundingClientRect();
    gestureCtx.clearRect(0, 0, rect.width, rect.height);

    if (!landmarks) return;

    const isPinching = Boolean(state?.isPinching);
    const tool = state?.tool || null;

    gestureCtx.lineWidth = 2;
    gestureCtx.strokeStyle = "rgba(17,24,39,0.32)";
    gestureCtx.fillStyle = "rgba(17,24,39,0.42)";

    for (const [from, to] of HAND_CONNECTIONS) {
      const a = landmarkToPoint(landmarks[from], rect);
      const b = landmarkToPoint(landmarks[to], rect);
      gestureCtx.beginPath();
      gestureCtx.moveTo(a.x, a.y);
      gestureCtx.lineTo(b.x, b.y);
      gestureCtx.stroke();
    }

    for (const landmark of landmarks) {
      const dot = landmarkToPoint(landmark, rect);
      gestureCtx.beginPath();
      gestureCtx.arc(dot.x, dot.y, 3, 0, Math.PI * 2);
      gestureCtx.fill();
    }

    drawPointer(point, isPinching, tool);
  }

  return { draw, context: gestureCtx };
}
