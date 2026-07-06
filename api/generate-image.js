const AGNES_IMAGE_ENDPOINT = "https://apihub.agnes-ai.com/v1/images/generations";
const AGNES_IMAGE_MODELS = new Set(["agnes-image-2.1-flash", "agnes-image-2.0-flash"]);
const AGNES_IMAGE_SIZES = new Set(["1024x1024", "1024x768", "768x1024"]);

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.AGNES_API_KEY;
  if (!apiKey) {
    return response.status(400).json({ error: "请先设置环境变量 AGNES_API_KEY" });
  }

  const { image, prompt = "", model = "agnes-image-2.1-flash", size = "1024x768" } = request.body || {};
  if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
    return response.status(400).json({ error: "缺少有效的画布图片" });
  }
  if (!String(prompt).trim()) {
    return response.status(400).json({ error: "请输入生成提示词" });
  }
  if (!AGNES_IMAGE_MODELS.has(model)) {
    return response.status(400).json({ error: "不支持的 Agnes 图像模型" });
  }
  if (!AGNES_IMAGE_SIZES.has(size)) {
    return response.status(400).json({ error: "不支持的图片尺寸" });
  }

  try {
    const agnesResponse = await fetch(AGNES_IMAGE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        size,
        extra_body: {
          image: [image],
          response_format: "b64_json",
        },
      }),
    });
    const text = await agnesResponse.text();
    const data = JSON.parse(text);
    return response.status(agnesResponse.status).json(data);
  } catch (error) {
    return response.status(502).json({
      error: "Agnes API 请求失败",
      details: error?.message || String(error),
    });
  }
}
