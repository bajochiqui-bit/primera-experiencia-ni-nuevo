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
    return {
      statusCode: 204,
      headers,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return reply(405, {
      error: "Método no permitido. Usa POST.",
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("Falta GEMINI_API_KEY en Netlify.");

    return reply(500, {
      error: "No está configurada la clave de Gemini en Netlify.",
    });
  }

  let input;

  try {
    input = JSON.parse(event.body || "{}");
  } catch {
    return reply(400, {
      error: "El cuerpo de la solicitud no es JSON válido.",
    });
  }

  const { question, answer, level } = input;

  if (
    typeof question !== "string" ||
    !question.trim() ||
    typeof answer !== "string" ||
    answer.trim().split(/\s+/).filter(Boolean).length < 25
  ) {
    return reply(400, {
      error: "Escribe una pregunta y una respuesta de al menos 25 palabras.",
    });
  }

  const prompt = `
Eres una profesora experta en Negocios Internacionales,
comercio exterior, logística y procedimientos aduaneros del Perú.

Evalúa la respuesta de una persona que participa en una entrevista
académica o práctica profesional.

Nivel del estudiante: ${String(level || "intermedio")}
Pregunta: ${question.trim()}
Respuesta del estudiante: ${answer.trim()}

Evalúa:
1. Precisión y comprensión del tema.
2. Razonamiento y justificación.
3. Pasos o procedimientos que propone.
4. Riesgos que identifica.
5. Claridad y comunicación profesional.

Sé objetiva, exigente y constructiva.
No inventes leyes, artículos, cifras ni fuentes.
Adapta la evaluación a la pregunta y al nivel del estudiante.
La puntuación debe ser de 0 a 100.

Devuelve exclusivamente un objeto JSON válido con esta estructura:
{
  "score": 75,
  "summary": "Evaluación general de la respuesta",
  "strengths": ["Fortaleza concreta"],
  "improvements": ["Mejora concreta y útil"],
  "sample_answer": "Ejemplo mejorado de respuesta"
}

La puntuación debe ser un número entre 0 y 100.
Incluye al menos una fortaleza y una mejora.
`;

  try {
    const model = "gemini-3.8-flash";

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
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Error de Gemini:",
        response.status,
        JSON.stringify(data)
      );

      return reply(502, {
        error: "Gemini no pudo evaluar la respuesta.",
        details:
          data?.error?.message ||
          "El proveedor no devolvió detalles del error.",
      });
    }

    const text = (data.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || "")
      .join("")
      .trim();

    if (!text) {
      console.error(
        "Gemini devolvió una respuesta vacía:",
        JSON.stringify(data)
      );

      return reply(502, {
        error: "Gemini devolvió una respuesta vacía.",
      });
    }

    let result;

    try {
      result = JSON.parse(text);
    } catch {
      console.error("Gemini devolvió JSON inválido:", text);

      return reply(502, {
        error: "La respuesta de Gemini tiene un formato no válido.",
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
      console.error(
        "Estructura inesperada:",
        JSON.stringify(result)
      );

      return reply(502, {
        error: "La evaluación no tiene el formato esperado.",
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
