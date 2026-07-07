import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import generateImage from "../api/generate-image.js";
import generateImageStatus from "../api/generate-image/status.js";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT || 3025);

const apiRoutes = new Map([
  ["/api/generate-image", generateImage],
  ["/api/generate-image/status", generateImageStatus],
]);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  return JSON.parse(text);
}

function createApiResponse(serverResponse) {
  return {
    statusCode: 200,
    setHeader(name, value) {
      serverResponse.setHeader(name, value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      const body = JSON.stringify(data);
      serverResponse.writeHead(this.statusCode, { "Content-Type": "application/json; charset=utf-8" });
      serverResponse.end(body);
      return this;
    },
  };
}

async function handleApi(request, response, url) {
  const handler = apiRoutes.get(url.pathname);
  if (!handler) return false;
  request.query = Object.fromEntries(url.searchParams.entries());
  request.body = request.method === "GET" ? {} : await readBody(request);
  await handler(request, createApiResponse(response));
  return true;
}

async function handleStatic(_request, response, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = normalize(join(root, requestedPath));
  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    response.writeHead(200, { "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream" });
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    if (await handleApi(request, response, url)) return;
    await handleStatic(request, response, url);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error?.message || String(error) }));
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Local dev server: http://127.0.0.1:${port}`);
});
