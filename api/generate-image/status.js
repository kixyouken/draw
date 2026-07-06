export default function handler(_request, response) {
  response.status(200).json({ configured: Boolean(process.env.AGNES_API_KEY) });
}
