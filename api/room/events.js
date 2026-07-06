import { getEvents } from "../_room-store.js";

export default async function handler(request, response) {
  const { room = "lobby", since = "0", clientId, name = "匿名" } = request.query || {};
  if (!clientId) return response.status(400).json({ error: "Missing clientId" });

  try {
    const result = await getEvents(room, Number(since) || 0, clientId, name);
    return response.status(200).json(result);
  } catch (error) {
    return response.status(500).json({ error: error?.message || String(error) });
  }
}
