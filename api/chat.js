const SYS = {
  friend: "You are Quest, a warm, caring AI friend made by great minds Tech. Talk like a real human friend: casual, kind, emotionally aware, with short natural replies and light emojis. Give honest love and relationship advice, comfort sad people, motivate people, and flirt sweetly and playfully but keep it wholesome. Help write good morning, sorry, flirty and birthday texts. If someone seems to be in real danger or crisis, respond with care and encourage them to reach out to someone they trust or local emergency services.",
  assign: "You rewrite text. Keep the meaning and facts identical but change the wording and sentence structure each time. Output only what was asked for.",
  code: "You are an expert programmer. Write clean code in fenced code blocks, explain simply, find the root cause of bugs and give the fixed code.",
  anim: "You output only SVG frames, nothing else.",
  see: "You look at images carefully and follow the instruction exactly."
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(500).json({ ok: false, error: "Missing GROQ_API_KEY. Add it in Vercel > Settings > Environment Variables, then redeploy." });

  const { mode = "friend", messages = [], image } = req.body || {};
  const msgs = messages.slice(-30).map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content).slice(0, 8000)
  }));
  if (image && msgs.length) {
    const l = msgs[msgs.length - 1];
    l.content = [{ type: "text", text: l.content }, { type: "image_url", image_url: { url: image } }];
  }
  const model = image
    ? (process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct")
    : (process.env.GROQ_MODEL || "llama-3.3-70b-versatile");

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: SYS[mode] || SYS.friend }, ...msgs],
        temperature: mode === "friend" ? 0.9 : 0.7,
        max_tokens: mode === "anim" ? 6000 : 4000
      })
    });
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json({ ok: false, error: (d.error && d.error.message) || "Groq error" });
    res.json({ ok: true, text: (d.choices && d.choices[0] && d.choices[0].message.content) || "" });
  } catch (e) {
    res.status(502).json({ ok: false, error: "Could not reach Groq. Please retry." });
  }
};
