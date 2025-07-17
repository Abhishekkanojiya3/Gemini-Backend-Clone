import axios from "axios";

export const callGeminiAPI = async (prompt) => {
  try {
    const res = await axios.post(
      "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent",
      {
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      },
      {
        params: { key: process.env.GEMINI_API_KEY },
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      }
    );

    const text = res.data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || "No response from Gemini.";
  } catch (error) {
    const { status } = err.response;
    if (status === 429) {
      return "You've hit the rate limit. Please try again later.";
    } else if (status === 403) {
      return "Forbidden: Check your API key or permissions.";
    } else if (status === 404) {
      return "Model not found. Check the model name.";
    }
  }
};
