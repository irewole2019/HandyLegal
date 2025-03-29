import { Configuration, OpenAIApi } from 'openai';

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { message } = req.body;

    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful legal assistant. Provide clear, accurate, and concise legal information. Always remind users that you are an AI and recommend consulting with a lawyer for specific legal advice."
        },
        {
          role: "user",
          content: message
        }
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const response = completion.data.choices[0].message.content;
    res.status(200).json({ message: response });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'An error occurred while processing your request.' });
  }
} 