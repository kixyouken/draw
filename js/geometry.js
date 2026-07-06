import { WORLD_HEIGHT, WORLD_WIDTH } from "./constants.js";

export function normalizePoint(point) {
  return { x: point.x / WORLD_WIDTH, y: point.y / WORLD_HEIGHT };
}

export function denormalizePoint(point) {
  return { x: point.x * WORLD_WIDTH, y: point.y * WORLD_HEIGHT };
}

export function landmarkToPoint(landmark, rect) {
  return { x: (1 - landmark.x) * rect.width, y: landmark.y * rect.height };
}

export function screenToWorld(point, viewport) {
  return {
    x: (point.x - viewport.x) / viewport.scale,
    y: (point.y - viewport.y) / viewport.scale,
  };
}

export function isInsideWorld(point) {
  return point.x >= 0 && point.x <= WORLD_WIDTH && point.y >= 0 && point.y <= WORLD_HEIGHT;
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function normalizedDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

export function isOpenPalm(landmarks) {
  const fingers = [
    [8, 6],
    [12, 10],
    [16, 14],
    [20, 18],
  ];
  const extendedCount = fingers.reduce((count, [tip, pip]) => {
    return count + (landmarks[tip].y < landmarks[pip].y - 0.015 ? 1 : 0);
  }, 0);
  return extendedCount >= 3;
}
