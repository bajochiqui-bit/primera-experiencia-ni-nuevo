
exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Método no permitido" }),
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Falta configurar GEMINI_API_KEY en Netlify.",
      }),
    };
  }

  try {
    const { question, answer, level } = JSON.parse(event.body || "{}");

    if (
      typeof question !== "string" ||
      typeof answer !== "string" ||
      answer.trim().split(/\s+/).filter(Boolean).length < 25
    ) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Envía una pregunta y una respuesta de al menos 25 palabras.",
        }),
      };
    }

    const prompt = `
Actúa como profesora experta en Negocios Internacionales,
comercio exterior, logística y aduanas del Perú.

Evalúa la respuesta de una estudiante en una entrevista simulada.
Nivel: ${String(level || "intermedio")}
Pregunta: ${question}
Respuesta de la estudiante: ${answer}

Evalúa precisión, razonamiento, pasos propuestos, riesgos y comunicación.
No inventes normas ni afirmes que se verificó una fuente si no fue así.
Sé constructiva, concreta y adecuada para una estudiante.

Devuelve SOLAMENTE un objeto JSON con esta estructura:
{
  "score": 0,
  "summary": "Resumen de la evaluación",
  "strengths": ["fortaleza 1", "fortaleza 2"],
  "improvements": ["mejora 1", "mejora 2"],
  "sample_answer": "Ejemplo mejorado de respuesta"
}
La puntuación debe ser un número entre 0 y 100.
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
        encodeURIComponent(apiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", response.status, data);
      return {
        statusCode: response.status === 429 ? 429 : 502,
        headers,
        body: JSON.stringify({
          error:
            response.status === 429
              ? "Gemini alcanzó su cuota o límite de solicitudes. Revisa el nivel gratuito del proyecto."
              : "Gemini no pudo completar la evaluación. Revisa los registros de Netlify.",
        }),
      };
    }

    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("") || "";

    const result = JSON.parse(text);

    const score = Number(result.score);
    if (
      !Number.isFinite(score) ||
      typeof result.summary !== "string" ||
      !Array.isArray(result.strengths) ||
      !Array.isArray(result.improvements) ||
      typeof result.sample_answer !== "string"
    ) {
      throw new Error("Gemini devolvió una respuesta con formato inesperado.");
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        score: Math.max(0, Math.min(100, score)),
        summary: result.summary,
        strengths: result.strengths,
        improvements: result.improvements,
        sample_answer: result.sample_answer,
      }),
    };
  } catch (error) {
    console.error("Error evaluando entrevista:", error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "No se pudo completar la evaluación con Gemini.",
      }),
    };
  }
};
