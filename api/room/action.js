import { appendAction } from "../_room-store.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const { room = "lobby", clientId, name = "匿名", action } = request.body || {};
  if (!clientId || !action?.type) {
    return response.status(400).json({ error: "Missing clientId or action" });
  }

  try {
    const result = await appendAction(room, action, clientId, name);
    return response.status(200).json(result);
  } catch (error) {
    return response.status(500).json({ error: error?.message || String(error) });
  }
}
