exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Método no permitido" }) };
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not available to this function runtime");
    return { statusCode: 503, headers, body: JSON.stringify({ error: "AI_NOT_CONFIGURED" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const question = String(body.question || "").trim();
    const answer = String(body.answer || "").trim();
    const level = String(body.level || body.nivel || "basic").trim();
    const words = answer.split(/\s+/).filter(Boolean);
    if (!question || words.length < 25) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "INVALID_INPUT", message: "Incluye la pregunta y una respuesta de al menos 25 palabras." }) };
    }

    const systemPrompt = `Eres una evaluadora de entrevistas para estudiantes de Negocios Internacionales que buscan su primera experiencia laboral en comercio exterior en Perú. Evalúa con rigor pero de forma constructiva. No inventes normas ni afirmes datos legales específicos. Devuelve únicamente JSON válido con esta estructura: {"score": número entero 0-100, "summary": texto breve en español, "strengths": arreglo de 2 a 4 fortalezas, "improvements": arreglo de 2 a 4 mejoras concretas, "sample_answer": una respuesta de ejemplo mejorada en español}. Valora claridad, pasos concretos, razonamiento, comunicación, consideración de riesgos y contexto profesional. Nivel: ${level}.`;
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Pregunta de entrevista: ${question}\n\nRespuesta de la persona: ${answer}` }
        ]
      })
    });
    const raw = await response.text();
    if (!response.ok) {
      console.error("OpenAI API error", response.status, raw.slice(0, 1200));
      return { statusCode: 502, headers, body: JSON.stringify({ error: "OPENAI_REQUEST_FAILED", status: response.status, message: "La función llegó a OpenAI, pero la API rechazó la solicitud. Revisa los registros de la función." }) };
    }
    const data = JSON.parse(raw);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned no content");
    const result = JSON.parse(content);
    const score = Math.max(0, Math.min(100, Math.round(Number(result.score) || 0)));
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        score,
        summary: String(result.summary || "Evaluación completada."),
        strengths: Array.isArray(result.strengths) ? result.strengths.map(String).slice(0, 5) : [],
        improvements: Array.isArray(result.improvements) ? result.improvements.map(String).slice(0, 5) : [],
        sample_answer: String(result.sample_answer || "")
      })
    };
  } catch (error) {
    console.error("evaluate-interview error", error?.stack || error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "FUNCTION_ERROR", message: "La función encontró un error interno. Consulta los registros de Netlify." }) };
  }
};
