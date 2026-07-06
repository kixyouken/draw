const CLIENT_ID_KEY = "gesture-draw-client-id";
const DEFAULT_ROOM = "lobby";

function getClientId() {
  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || response.statusText);
  }
  return data;
}

export function createRoomController({
  actionHistory,
  canvas,
  membersList,
  roomInput,
  nameInput,
  joinRoomButton,
  setStatus,
  t,
}) {
  const clientId = getClientId();
  const localChannel = "BroadcastChannel" in window ? new BroadcastChannel("gesture-draw-room") : null;
  let currentRoom = null;
  let displayName = "";
  let lastSeq = 0;
  let pollTimer = null;
  let remoteSyncAvailable = true;
  let currentMembers = [];

  function updateMembers(members = []) {
    if (!membersList) return;
    currentMembers = members;
    membersList.textContent = `${t("hud_members")}：${currentMembers.length ? currentMembers.join("，") : t("hud_empty")}`;
  }

  function applyRemoteAction(action, history) {
    if (!action || action.clientId === clientId) return;

    if (action.type === "draw_line") {
      actionHistory.push(action);
      canvas.applyAction(action);
    }
    if (action.type === "clear_canvas") {
      actionHistory.length = 0;
      canvas.clear();
    }
    if (action.type === "undo") {
      actionHistory.length = 0;
      actionHistory.push(...(history || []));
      canvas.redrawHistory();
    }
  }

  function applySnapshot(snapshot = {}) {
    if (Array.isArray(snapshot.history)) {
      actionHistory.length = 0;
      actionHistory.push(...snapshot.history);
      canvas.redrawHistory();
    }
    if (Array.isArray(snapshot.members)) {
      updateMembers(snapshot.members);
    }
    if (Number.isFinite(snapshot.lastSeq)) {
      lastSeq = Math.max(lastSeq, snapshot.lastSeq);
    }
  }

  async function pollRoom() {
    if (!currentRoom || !remoteSyncAvailable) return;
    try {
      const params = new URLSearchParams({
        room: currentRoom,
        since: String(lastSeq),
        clientId,
        name: displayName,
      });
      const data = await requestJson(`/api/room/events?${params}`);
      remoteSyncAvailable = data.remote !== false;
      for (const event of data.events || []) {
        lastSeq = Math.max(lastSeq, event.seq || 0);
        applyRemoteAction(event.action, event.history);
      }
      updateMembers(data.members || []);
    } catch (error) {
      console.warn(error);
    }
  }

  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(pollRoom, 1400);
  }

  async function joinRoom(room, name) {
    currentRoom = room;
    displayName = name;
    lastSeq = 0;
    localChannel?.postMessage({ type: "join_room", room, name, clientId });

    try {
      const data = await requestJson("/api/room/join", {
        method: "POST",
        body: JSON.stringify({ room, name, clientId }),
      });
      remoteSyncAvailable = data.remote !== false;
      applySnapshot(data);
      startPolling();
    } catch (error) {
      remoteSyncAvailable = false;
      updateMembers([name]);
      console.warn(error);
    }

    const suffix = remoteSyncAvailable ? "" : " (本机同步)";
    setStatus(t("room_joined") + ` ${room}${suffix}`, "ready");
  }

  async function sendAction(action) {
    if (!currentRoom) return;

    const actionWithMeta = { ...action, clientId };
    localChannel?.postMessage({
      type: "room_action",
      room: currentRoom,
      action: actionWithMeta,
      history: actionHistory,
      clientId,
    });

    if (!remoteSyncAvailable) return;
    try {
      const data = await requestJson("/api/room/action", {
        method: "POST",
        body: JSON.stringify({
          room: currentRoom,
          clientId,
          name: displayName,
          action: actionWithMeta,
          history: actionHistory,
        }),
      });
      if (Number.isFinite(data.lastSeq)) lastSeq = Math.max(lastSeq, data.lastSeq);
      updateMembers(data.members || []);
    } catch (error) {
      console.warn(error);
      remoteSyncAvailable = false;
    }
  }

  function bindEvents() {
    joinRoomButton?.addEventListener("click", () => {
      const room = (roomInput?.value || "").trim() || DEFAULT_ROOM;
      const name = (nameInput?.value || "").trim() || `匿名${Math.floor(Math.random() * 9000) + 1000}`;
      joinRoom(room, name);
    });

    localChannel?.addEventListener("message", (event) => {
      const message = event.data || {};
      if (!currentRoom || message.room !== currentRoom || message.clientId === clientId) return;
      if (message.type === "join_room") {
        updateMembers([displayName, message.name].filter(Boolean));
      }
      if (message.type === "room_action") {
        applyRemoteAction(message.action, message.history);
      }
    });

    window.addEventListener("language-changed", () => updateMembers(currentMembers));
    window.addEventListener("beforeunload", () => clearInterval(pollTimer));
  }

  function getCurrentRoom() {
    return currentRoom;
  }

  return { bindEvents, getCurrentRoom, sendAction };
}
