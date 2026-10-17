
exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  const reply = (statusCode, data) => ({
    statusCode,
    headers,
    body: JSON.stringify(data),
  });

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return reply(405, { error: "Método no permitido. Usa POST." });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("Falta la variable GEMINI_API_KEY.");
    return reply(500, {
      error: "Falta GEMINI_API_KEY en las variables de entorno de Netlify.",
    });
  }

  let input;

  try {
    input = JSON.parse(event.body || "{}");
  } catch {
    return reply(400, { error: "El cuerpo de la solicitud no es JSON válido." });
  }

  const { question, answer, level } = input;

  if (
    typeof question !== "string" ||
    typeof answer !== "string" ||
    answer.trim().split(/\s+/).filter(Boolean).length < 25
  ) {
    return reply(400, {
      error: "Escribe una pregunta y una respuesta de al menos 25 palabras.",
    });
  }

  const prompt = `
Eres profesora de Negocios Internacionales, comercio exterior,
logística y aduanas del Perú. Evalúa esta respuesta de entrevista.

Nivel: ${String(level || "intermedio")}
Pregunta: ${question}
Respuesta: ${answer}

Evalúa precisión, razonamiento, pasos, riesgos y comunicación.
Sé constructiva y concreta. No inventes normas ni fuentes.
Devuelve exclusivamente un JSON con esta estructura:
{
  "score": 75,
  "summary": "Evaluación general",
  "strengths": ["Fortaleza identificada"],
  "improvements": ["Mejora concreta"],
  "sample_answer": "Ejemplo mejorado de respuesta"
}
score debe ser un número entre 0 y 100.
`;

  try {
    const model = "gemini-2.5-flash";
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      model +
      ":generateContent";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", response.status, data);

      return reply(response.status === 429 ? 429 : 502, {
        error: "Gemini no pudo evaluar la respuesta.",
        status: response.status,
        details:
          data?.error?.message ||
          "No se recibió información adicional del proveedor.",
      });
    }

    const text = (data.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || "")
      .join("");

    if (!text) {
      console.error("Gemini no devolvió texto:", JSON.stringify(data));
      return reply(502, {
        error: "Gemini devolvió una respuesta vacía.",
        details: "Revisa los registros de la función en Netlify.",
      });
    }

    let result;

    try {
      result = JSON.parse(text);
    } catch {
      console.error("Respuesta JSON inválida de Gemini:", text);
      return reply(502, {
        error: "Gemini devolvió un formato de respuesta no válido.",
      });
    }

    const score = Number(result.score);

    if (
      !Number.isFinite(score) ||
      typeof result.summary !== "string" ||
      !Array.isArray(result.strengths) ||
      !Array.isArray(result.improvements) ||
      typeof result.sample_answer !== "string"
    ) {
      console.error("Estructura inesperada de Gemini:", result);
      return reply(502, {
        error: "La evaluación de Gemini no tiene el formato esperado.",
      });
    }

    return reply(200, {
      score: Math.max(0, Math.min(100, score)),
      summary: result.summary,
      strengths: result.strengths,
      improvements: result.improvements,
      sample_answer: result.sample_answer,
    });
  } catch (error) {
    console.error("Error en evaluate-interview:", error);

    return reply(500, {
      error: "No se pudo completar la evaluación con Gemini.",
      details: error.message || "Error interno de la función.",
    });
  }
};
};
