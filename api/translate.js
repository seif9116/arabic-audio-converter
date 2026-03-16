export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text, target = 'en', source = 'ar' } = req.body;

  const response = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${process.env.GOOGLE_CLOUD_API_KEY}&q=${encodeURIComponent(text)}&target=${target}&source=${source}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } }
  );

  const data = await response.json();
  res.status(response.status).json(data);
}
