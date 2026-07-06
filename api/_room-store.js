const ROOM_TTL_SECONDS = 60 * 60 * 6;
const MEMBER_TTL_MS = 18_000;
const MAX_EVENTS = 600;

function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function redis(command) {
  const config = redisConfig();
  if (!config) return null;
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error || response.statusText);
  }
  return data.result;
}

function roomKey(room, name) {
  const safeRoom = String(room || "lobby").replace(/[^\w.-]/g, "_").slice(0, 80) || "lobby";
  return `gesture-draw:${safeRoom}:${name}`;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function cleanMembers(members) {
  const now = Date.now();
  return Object.fromEntries(
    Object.entries(members || {}).filter(([, member]) => member?.expiresAt > now),
  );
}

export async function isRemoteAvailable() {
  return Boolean(redisConfig());
}

export async function getRoomSnapshot(room) {
  if (!redisConfig()) {
    return { remote: false, history: [], members: [], lastSeq: 0 };
  }

  const [historyValue, membersValue, seqValue] = await Promise.all([
    redis(["GET", roomKey(room, "history")]),
    redis(["GET", roomKey(room, "members")]),
    redis(["GET", roomKey(room, "seq")]),
  ]);

  const members = cleanMembers(parseJson(membersValue, {}));
  await redis(["SET", roomKey(room, "members"), JSON.stringify(members), "EX", ROOM_TTL_SECONDS]);

  return {
    remote: true,
    history: parseJson(historyValue, []),
    members: Object.values(members).map((member) => member.name),
    lastSeq: Number(seqValue || 0),
  };
}

export async function touchMember(room, clientId, name) {
  if (!redisConfig()) return { remote: false, members: [] };
  const key = roomKey(room, "members");
  const members = cleanMembers(parseJson(await redis(["GET", key]), {}));
  members[clientId] = {
    name: String(name || "匿名").slice(0, 32),
    expiresAt: Date.now() + MEMBER_TTL_MS,
  };
  await redis(["SET", key, JSON.stringify(members), "EX", ROOM_TTL_SECONDS]);
  return { remote: true, members: Object.values(members).map((member) => member.name) };
}

export async function appendAction(room, action, clientId, name) {
  if (!redisConfig()) return { remote: false, lastSeq: 0, members: [] };

  const historyKey = roomKey(room, "history");
  const eventsKey = roomKey(room, "events");
  const seqKey = roomKey(room, "seq");
  const rawHistory = await redis(["GET", historyKey]);
  const history = parseJson(rawHistory, []);
  const normalizedAction = { ...action, clientId };

  if (normalizedAction.type === "draw_line") {
    history.push(normalizedAction);
  }
  if (normalizedAction.type === "clear_canvas") {
    history.length = 0;
  }
  if (normalizedAction.type === "undo") {
    history.pop();
  }

  const seq = Number(await redis(["INCR", seqKey]));
  const event = { seq, action: normalizedAction, history };
  await Promise.all([
    redis(["SET", historyKey, JSON.stringify(history), "EX", ROOM_TTL_SECONDS]),
    redis(["RPUSH", eventsKey, JSON.stringify(event)]),
    redis(["LTRIM", eventsKey, -MAX_EVENTS, -1]),
    redis(["EXPIRE", eventsKey, ROOM_TTL_SECONDS]),
    redis(["EXPIRE", seqKey, ROOM_TTL_SECONDS]),
    touchMember(room, clientId, name),
  ]);
  const snapshot = await getRoomSnapshot(room);
  return { remote: true, lastSeq: seq, members: snapshot.members };
}

export async function getEvents(room, since, clientId, name) {
  if (!redisConfig()) return { remote: false, events: [], members: [] };

  const events = (await redis(["LRANGE", roomKey(room, "events"), 0, -1]) || [])
    .map((entry) => parseJson(entry, null))
    .filter((event) => event && event.seq > since);
  const membership = await touchMember(room, clientId, name);
  return { remote: true, events, members: membership.members };
}
