export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { input, voice = 'onyx', speed = 1.0 } = req.body;

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1-hd',
      input,
      voice,
      response_format: 'mp3',
      speed,
    }),
  });

  const buffer = await response.arrayBuffer();
  res.setHeader('Content-Type', 'audio/mpeg');
  res.status(response.status).send(Buffer.from(buffer));
}
