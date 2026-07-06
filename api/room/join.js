import { getRoomSnapshot, touchMember } from "../_room-store.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const { room = "lobby", name = "匿名", clientId } = request.body || {};
  if (!clientId) return response.status(400).json({ error: "Missing clientId" });

  try {
    await touchMember(room, clientId, name);
    const snapshot = await getRoomSnapshot(room);
    return response.status(200).json(snapshot);
  } catch (error) {
    return response.status(500).json({ error: error?.message || String(error) });
  }
}
