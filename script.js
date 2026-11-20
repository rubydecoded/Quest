const IMG_API = "https://fei-ai.benfeitech.net/api/generate";
const CHAT_API = "/api/chat";

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const wait = ms => new Promise(r => setTimeout(r, ms));

function toast(t) {
  const el = $("toast");
  el.textContent = t;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}
function fmt(t) {
  return String(t).split(/```/).map((p, i) => i % 2
    ? "<pre>" + esc(p.replace(/^[^\n]*\n/, "")) + "</pre>"
    : esc(p).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>")).join("");
}
async function copy(t) {
  try { await navigator.clipboard.writeText(t); toast("Copied"); }
  catch (e) { window.prompt("Copy this:", t); }
}
document.addEventListener("click", e => {
  const p = e.target.closest("pre,.ver");
  if (p) copy(p.classList.contains("ver") ? p.querySelector("p").innerText : p.innerText);
});

/* text AI (Groq through /api/chat) */
async function ask(mode, messages, image) {
  let r;
  try {
    r = await fetch(CHAT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, messages, image })
    });
  } catch (e) { throw new Error("Network problem. Check your internet and retry."); }
  if (r.status === 429) throw new Error("Too many requests, wait a minute and try again.");
  if (r.status === 404) throw new Error("Text AI isn't connected yet. Add api/chat.js and GROQ_API_KEY in Vercel.");
  let d = {};
  try { d = await r.json(); } catch (e) {}
  if (!r.ok || !d.ok) throw new Error(d.error || "Something went wrong. Please retry.");
  return d.text;
}
async function run(btn, out, fn) {
  if (btn.disabled) return;
  const t = btn.textContent;
  btn.disabled = true; btn.textContent = "Working...";
  if (out) out.textContent = "";
  try { await fn(); }
  catch (e) { if (out) out.innerHTML = '<p class="e">' + esc(e.message) + "</p>"; else toast(e.message); }
  finally { btn.disabled = false; btn.textContent = t; }
}

/* ---------- theme & tabs ---------- */
try { const t = localStorage.getItem("quest_theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
$("theme").onclick = () => {
  const d = document.documentElement;
  d.dataset.theme = d.dataset.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem("quest_theme", d.dataset.theme); } catch (e) {}
};
function goTab(n) {
  $$("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.t === n));
  $$(".panel").forEach(p => p.classList.toggle("on", p.id === "p-" + n));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$$("#tabs button").forEach(b => b.onclick = () => goTab(b.dataset.t));

/* ---------- 1. CHAT ---------- */
let chat = load("quest_chat", []), cbusy = false;
function bubble(r, t) {
  const d = document.createElement("div");
  d.className = "b " + r;
  d.innerHTML = fmt(t);
  $("log").appendChild(d);
  $("log").scrollTop = 1e9;
  return d;
}
if (chat.length) chat.forEach(m => bubble(m.role, m.content));
else bubble("assistant", "Hey, I'm Quest 💙 Talk to me about love, crushes, breakups or a rough day. I can also help with code, homework and more.");
const QC = {
  "☀️ Good morning text": "Help me write a sweet good morning text for ",
  "😔 Sorry text": "Help me write a heartfelt sorry text to ",
  "😘 Flirty text": "Help me write a sweet flirty text for ",
  "🎂 Birthday text": "Help me write a birthday text for ",
  "💪 Motivate me": "I need some motivation. ",
  "💔 Breakup help": "I'm going through a breakup. "
};
Object.keys(QC).forEach(k => {
  const b = document.createElement("button");
  b.className = "chip"; b.textContent = k;
  b.onclick = () => { $("cin").value = QC[k]; $("cin").focus(); };
  $("qchips").appendChild(b);
});
async function send() {
  const text = $("cin").value.trim();
  if (!text || cbusy) return;
  cbusy = true; $("cin").value = "";
  chat.push({ role: "user", content: text });
  bubble("user", text);
  const t = bubble("assistant", "");
  t.classList.add("typing"); t.innerHTML = "<i></i><i></i><i></i>";
  try {
    const a = await ask("friend", chat.slice(-30));
    chat.push({ role: "assistant", content: a });
    t.classList.remove("typing"); t.innerHTML = fmt(a);
  } catch (e) {
    chat.pop();
    t.classList.remove("typing"); t.classList.add("err"); t.textContent = e.message;
  }
  store("quest_chat", chat.slice(-40));
  $("log").scrollTop = 1e9;
  cbusy = false;
}
$("csend").onclick = send;
$("cin").onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
$("cclear").onclick = () => { chat = []; store("quest_chat", []); $("log").innerHTML = ""; bubble("assistant", "Fresh start! What's on your mind? 💙"); };

/* ---------- 2. IMAGE GENERATION ---------- */
const STYLES = {
  "None": "", "Anime": "anime style, vibrant colors, detailed", "3D Render": "3D render, octane, soft lighting",
  "Watercolor": "watercolor painting, soft washes", "Cyberpunk": "cyberpunk, neon lights, futuristic city",
  "Oil Painting": "oil painting, rich brush strokes"
};
const EXAMPLES = [
  "A girl with silver hair under cherry blossoms", "Cute 3D cartoon fox wearing a space helmet",
  "A quiet village by a lake in soft watercolor", "Neon samurai walking through a rainy cyberpunk street",
  "A dragon sleeping on a floating fantasy island", "Realistic portrait of an old fisherman at sunrise"
];
const MSGS = ["Warming up the AI...", "Mixing colors...", "Adding fine details...", "Polishing the pixels...", "Almost there..."];
const PANELS = ["loading", "error", "result"];
let style = "None", busy = false, current = "", tick = null, secs = 0, prog = 0, mi = 0;
const showP = id => PANELS.forEach(p => $(p).classList.toggle("hidden", p !== id));

Object.keys(STYLES).forEach(s => {
  const b = document.createElement("button");
  b.className = "chip" + (s === style ? " on" : ""); b.textContent = s;
  b.onclick = () => { style = s; $$("#styles .chip").forEach(c => c.classList.toggle("on", c === b)); };
  $("styles").appendChild(b);
});
EXAMPLES.forEach(t => {
  const b = document.createElement("button");
  b.className = "chip"; b.textContent = t;
  b.onclick = () => { $("prompt").value = t; $("cnt").textContent = t.length; };
  $("examples").appendChild(b);
});
$("prompt").oninput = e => { $("cnt").textContent = e.target.value.length; };

function startLoading() {
  secs = 0; prog = 0; mi = 0;
  $("fill").style.width = "0%"; $("sec").textContent = "0s"; $("msg").textContent = MSGS[0];
  let n = 0;
  tick = setInterval(() => {
    n++;
    prog += (90 - prog) * 0.03;
    $("fill").style.width = prog + "%";
    if (n % 5 === 0) { secs++; $("sec").textContent = secs + "s"; }
    if (n % 15 === 0) {
      $("msg").classList.add("f");
      setTimeout(() => { mi = (mi + 1) % MSGS.length; $("msg").textContent = MSGS[mi]; $("msg").classList.remove("f"); }, 300);
    }
  }, 200);
}
function burst() {
  for (let i = 0; i < 24; i++) {
    const b = document.createElement("b"), a = Math.random() * 6.28, d = 60 + Math.random() * 100;
    b.style.setProperty("--x", Math.cos(a) * d + "px");
    b.style.setProperty("--y", Math.sin(a) * d + "px");
    $("res").appendChild(b);
    setTimeout(() => b.remove(), 1000);
  }
}
function reveal(url, fx) {
  current = url;
  const el = $("img");
  el.classList.remove("in"); el.src = url;
  showP("result");
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("in")));
  if (fx) burst();
}
function loadImage(url) {
  return new Promise((ok, no) => {
    $("fill").style.width = "100%";
    const im = new Image();
    im.onload = ok;
    im.onerror = () => no(new Error("The image could not load. Please retry."));
    im.src = url;
  });
}
const getHist = () => load("quest_hist", []);
function saveHist(url, text) {
  const h = getHist().filter(x => x.url !== url);
  h.unshift({ url, text });
  store("quest_hist", h.slice(0, 6));
  renderHist();
}
function renderHist() {
  const h = getHist();
  $("histBox").classList.toggle("hidden", !h.length);
  $("hist").innerHTML = "";
  h.forEach(x => {
    const i = document.createElement("img");
    i.src = x.url; i.alt = x.text; i.title = x.text;
    i.onclick = () => { reveal(x.url, false); window.scrollTo({ top: 0, behavior: "smooth" }); };
    $("hist").appendChild(i);
  });
}
async function generate() {
  const text = $("prompt").value.trim();
  if (!text) { toast("Type a prompt first"); return; }
  if (busy) return;
  busy = true; $("go").disabled = true;
  showP("loading"); startLoading();
  const full = STYLES[style] ? text + ", " + STYLES[style] : text;
  const ctrl = new AbortController(), to = setTimeout(() => ctrl.abort(), 90000);
  try {
    const r = await fetch(IMG_API, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: full }), signal: ctrl.signal
    });
    if (r.status === 429) throw new Error("Too many requests, wait a minute and try again.");
    let d;
    try { d = await r.json(); } catch (e) { throw new Error("The server sent a bad reply. Please retry."); }
    if (!r.ok || !d.ok || !d.url) throw new Error(d.error || "Something went wrong. Please retry.");
    await loadImage(d.url);
    reveal(d.url, true);
    saveHist(d.url, text);
  } catch (e) {
    let m = e.message;
    if (e.name === "AbortError") m = "This took too long. Please retry.";
    else if (m === "Failed to fetch") m = "Network problem. Check your internet and retry.";
    $("errTxt").textContent = m;
    showP("error");
  } finally {
    clearTimeout(to); clearInterval(tick); busy = false; $("go").disabled = false;
  }
}
async function download() {
  try {
    const b = await (await fetch(current)).blob(), a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = "quest-" + Date.now() + ".png";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (e) { window.open(current, "_blank"); }
}
$("go").onclick = generate;
$("retry").onclick = generate;
$("dl").onclick = download;
$("cpy").onclick = () => copy(current);
$("again").onclick = () => { $("result").classList.add("hidden"); $("prompt").focus(); window.scrollTo({ top: 0, behavior: "smooth" }); };
$("toEdit").onclick = () => {
  fetch(current).then(r => r.blob()).then(b => { setImg(URL.createObjectURL(b)); goTab("edit"); })
    .catch(() => toast("Couldn't open it here. Download it, then upload it in Edit."));
};
renderHist();

/* ---------- 3. EDIT PICTURES ---------- */
const cv = $("cv"), cx = cv.getContext("2d");
let base = null, orig = null, stack = [], mode = "", filt = { b: 100, c: 100, f: "" }, drawing = false, st = null, last = null, stick = "😀";
const FL = { "None": "", "B&W": "grayscale(1)", "Sepia": "sepia(1)", "Invert": "invert(1)", "Blur": "blur(3px)" };
const HINT = {
  none: "Pick a tool, then tap or drag on the picture.",
  draw: "Drag on the picture to draw.", text: "Type your text above, then tap where it goes.",
  sticker: "Pick a sticker, then tap the picture.",
  cover: "Drag a box over text. Typed text replaces it; leave empty to remove it."
};
const fstr = () => `brightness(${filt.b}%) contrast(${filt.c}%) ${filt.f}`.trim();
const dup = c => { const n = mk(c.width, c.height); n.getContext("2d").drawImage(c, 0, 0); return n; };
function render() {
  if (!base) return;
  if (cv.width !== base.width || cv.height !== base.height) { cv.width = base.width; cv.height = base.height; }
  cx.clearRect(0, 0, cv.width, cv.height);
  cx.drawImage(base, 0, 0);
  cv.style.filter = fstr();
}
const snap = () => { if (!base) return; stack.push(dup(base)); if (stack.length > 12) stack.shift(); };
function setImg(src) {
  const im = new Image();
  im.onload = () => {
    const s = Math.min(1, 1280 / Math.max(im.width, im.height));
    base = mk(Math.round(im.width * s), Math.round(im.height * s));
    base.getContext("2d").drawImage(im, 0, 0, base.width, base.height);
    orig = dup(base); stack = [];
    filt = { b: 100, c: 100, f: "" }; $("br").value = 100; $("ct").value = 100;
    render();
  };
  im.onerror = () => toast("Could not open that image");
  im.src = src;
}
$("file").onchange = e => { const f = e.target.files[0]; if (f) setImg(URL.createObjectURL(f)); };

$$("#modes .chip").forEach(b => b.onclick = () => {
  mode = mode === b.dataset.m ? "" : b.dataset.m;
  $$("#modes .chip").forEach(x => x.classList.toggle("on", x.dataset.m === mode));
  $("hint").textContent = HINT[mode || "none"];
});
["😀", "😍", "🔥", "💙", "⭐", "🎉", "👑", "🌸"].forEach(s => {
  const b = document.createElement("button");
  b.className = "chip"; b.textContent = s;
  b.onclick = () => { stick = s; mode = "sticker"; $$("#modes .chip").forEach(x => x.classList.toggle("on", x.dataset.m === mode)); $("hint").textContent = HINT.sticker; };
  $("stk").appendChild(b);
});
Object.keys(FL).forEach(k => {
  const b = document.createElement("button");
  b.className = "chip" + (k === "None" ? " on" : ""); b.textContent = k;
  b.onclick = () => { filt.f = FL[k]; $$("#flt .chip").forEach(c => c.classList.toggle("on", c === b)); render(); };
  $("flt").appendChild(b);
});
$("br").oninput = e => { filt.b = e.target.value; render(); };
$("ct").oninput = e => { filt.c = e.target.value; render(); };

const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
function put(p, t, big) {
  const b = base.getContext("2d"), s = $("sz").value * base.width / 400 * (big ? 2 : 1);
  b.font = "bold " + s + "px system-ui,sans-serif";
  b.textAlign = "center"; b.textBaseline = "middle";
  b.fillStyle = $("col").value; b.fillText(t, p.x, p.y);
}
cv.addEventListener("pointerdown", e => {
  if (!base) { toast("Open a picture first"); return; }
  if (!mode) return;
  e.preventDefault(); cv.setPointerCapture(e.pointerId);
  const p = pos(e); snap();
  if (mode === "text") { put(p, $("etxt").value || "Text", false); render(); return; }
  if (mode === "sticker") { put(p, stick, true); render(); return; }
  drawing = true; st = p; last = p;
});
cv.addEventListener("pointermove", e => {
  if (!drawing) return;
  const p = pos(e);
  if (mode === "draw") {
    [base.getContext("2d"), cx].forEach(c => {
      c.strokeStyle = $("col").value; c.lineWidth = Math.max(2, $("sz").value / 4 * base.width / 400);
      c.lineCap = "round"; c.beginPath(); c.moveTo(last.x, last.y); c.lineTo(p.x, p.y); c.stroke();
    });
    last = p;
  } else if (mode === "cover") {
    render(); cx.strokeStyle = "#00c6ff"; cx.lineWidth = 2; cx.setLineDash([6, 4]);
    cx.strokeRect(st.x, st.y, p.x - st.x, p.y - st.y); cx.setLineDash([]);
  }
});
cv.addEventListener("pointerup", e => {
  if (!drawing) return;
  drawing = false;
  if (mode === "cover") {
    const p = pos(e), x = Math.min(st.x, p.x), y = Math.min(st.y, p.y), w = Math.abs(p.x - st.x), h = Math.abs(p.y - st.y);
    if (w > 4 && h > 4) {
      const b = base.getContext("2d"), d = b.getImageData(Math.max(0, x - 3), Math.max(0, y - 3), 1, 1).data;
      b.fillStyle = `rgb(${d[0]},${d[1]},${d[2]})`; b.fillRect(x, y, w, h);
      const t = $("etxt").value.trim();
      if (t) {
        let s = h * 0.7; b.font = "bold " + s + "px system-ui,sans-serif";
        const tw = b.measureText(t).width;
        if (tw > w * 0.95) { s *= w * 0.95 / tw; b.font = "bold " + s + "px system-ui,sans-serif"; }
        b.textAlign = "center"; b.textBaseline = "middle"; b.fillStyle = $("col").value; b.fillText(t, x + w / 2, y + h / 2);
      }
    } else stack.pop();
  }
  render();
});
$("rot").onclick = () => {
  if (!base) return; snap();
  const n = mk(base.height, base.width), g = n.getContext("2d");
  g.translate(n.width / 2, n.height / 2); g.rotate(Math.PI / 2); g.drawImage(base, -base.width / 2, -base.height / 2);
  base = n; render();
};
function crop(r) {
  if (!base) return; snap();
  let w = base.width, h = base.height;
  if (w / h > r) w = Math.round(h * r); else h = Math.round(w / r);
  const n = mk(w, h);
  n.getContext("2d").drawImage(base, -(base.width - w) / 2, -(base.height - h) / 2);
  base = n; render();
}
$("c11").onclick = () => crop(1); $("c43").onclick = () => crop(4 / 3); $("c169").onclick = () => crop(16 / 9);
$("rbg").onclick = () => {
  if (!base) return; snap();
  const b = base.getContext("2d"), im = b.getImageData(0, 0, base.width, base.height), d = im.data, r = d[0], g = d[1], bl = d[2];
  for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - r) + Math.abs(d[i + 1] - g) + Math.abs(d[i + 2] - bl) < 90) d[i + 3] = 0;
  b.putImageData(im, 0, 0); render(); toast("Plain background removed");
};
$("undo").onclick = () => { if (stack.length) { base = stack.pop(); render(); } };
$("reset").onclick = () => { if (!orig) return; base = dup(orig); stack = []; filt = { b: 100, c: 100, f: "" }; $("br").value = 100; $("ct").value = 100; render(); };
function editedURL() {
  const o = mk(base.width, base.height), g = o.getContext("2d");
  g.filter = fstr(); g.drawImage(base, 0, 0);
  return o.toDataURL("image/png");
}
$("save").onclick = () => {
  if (!base) return toast("Open a picture first");
  const a = document.createElement("a"); a.href = editedURL(); a.download = "quest-edit.png"; a.click();
};
function small() {
  const s = Math.min(1, 768 / Math.max(base.width, base.height)), o = mk(Math.round(base.width * s), Math.round(base.height * s)), g = o.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, o.width, o.height); g.drawImage(base, 0, 0, o.width, o.height);
  return o.toDataURL("image/jpeg", 0.8);
}
$("aiedit").onclick = () => run($("aiedit"), null, async () => {
  if (!base) throw new Error("Open a picture first");
  const q = $("aiq").value.trim();
  if (!q) throw new Error("Say what to change");
  const p = await ask("see", [{ role: "user", content: "Describe this image as one detailed image-generation prompt (max 80 words), applying this change: " + q + ". Output only the prompt." }], small());
  $("prompt").value = p.trim().slice(0, 500); $("cnt").textContent = $("prompt").value.length;
  goTab("image"); generate();
});
$("ocrb").onclick = () => run($("ocrb"), null, async () => {
  if (!base) throw new Error("Open a picture first");
  const t = await ask("see", [{ role: "user", content: "Read every piece of text in this image exactly as written. Output only the text, or say 'No text found'." }], small());
  $("ocr").textContent = t; $("ocr").classList.remove("hidden");
});

/* ---------- 4. HOMEWORK VERSIONS ---------- */
let vers = [];
$("hgo").onclick = () => run($("hgo"), $("hprog"), async () => {
  const q = $("hq").value.trim(), n = +$("hn").value;
  if (!q) throw new Error("Paste something first");
  vers = []; $("hout").innerHTML = "";
  const per = q.length > 1200 ? 3 : 10;
  let tries = 0;
  while (vers.length < n && tries++ < 40) {
    const k = Math.min(per, n - vers.length);
    const t = await ask("assign", [{ role: "user", content: `Original:\n${q}\n\nWrite ${k} different versions. Keep the same answer, meaning and facts, but change the wording and sentence structure.${vers.length ? " Avoid the wording of earlier versions." : ""} Separate versions with a line containing only ###. No numbering and no commentary.` }]);
    t.split(/^\s*###\s*$/m).map(s => s.trim()).filter(Boolean).slice(0, k).forEach(v => {
      vers.push(v);
      const d = document.createElement("div");
      d.className = "ver"; d.innerHTML = "<b>Version " + vers.length + "</b><p>" + fmt(v) + "</p>";
      $("hout").appendChild(d);
    });
    $("hprog").textContent = vers.length + " / " + n + " done...";
  }
  $("hprog").textContent = vers.length + " versions ready. Tap one to copy it.";
});

/* ---------- 5. CODE HELP ---------- */
const CODE = {
  write: "Write code for this. Use fenced code blocks and a short explanation:\n",
  explain: "Explain this code step by step in simple words:\n",
  fix: "Fix the errors in this code. Return the full corrected code and briefly say what was wrong:\n",
  debug: "Debug this. Find the root cause, explain it, and give the fix. Details:\n"
};
$$("#kbtns .btn").forEach(b => b.onclick = () => run(b, $("kout"), async () => {
  const q = $("kin").value.trim();
  if (!q) throw new Error("Paste your code or describe what you need");
  $("kout").innerHTML = fmt(await ask("code", [{ role: "user", content: CODE[b.dataset.a] + q }]));
}));

/* ---------- 6. ANIMATION ---------- */
let urls = [], fi = 0, playing = false, timer = null;
const delay = () => Math.max(40, 300 / $("spd").value);
function play() {
  clearInterval(timer); playing = true; $("pp").textContent = "⏸ Pause";
  timer = setInterval(() => { fi = (fi + 1) % urls.length; $("stage").src = urls[fi]; }, delay());
}
function pause() { clearInterval(timer); playing = false; $("pp").textContent = "▶ Play"; }
$("amake").onclick = () => run($("amake"), $("aerr"), async () => {
  const t = $("aq").value.trim();
  if (!t) throw new Error("Describe the animation first");
  const raw = await ask("anim", [{ role: "user", content: `Create a simple 8-frame looping animation of: ${t}. Output exactly 8 complete SVG frames, each starting with <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"> and ending with </svg>. Keep the same style, colors and layout in every frame, with small changes in pose or size between frames so it loops smoothly. Flat colorful shapes, no text, no scripts, no markdown, no commentary.` }]);
  const f = (raw.match(/<svg[\s\S]*?<\/svg>/gi) || []).map(s => s.replace(/<script[\s\S]*?<\/script>/gi, ""))
    .map(s => /<svg[^>]*\swidth=/i.test(s) ? s : s.replace(/<svg/i, '<svg width="400" height="400"'));
  if (f.length < 2) throw new Error("The AI didn't return a usable animation. Try a simpler idea.");
  urls = f.map(s => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s));
  fi = 0; $("stage").src = urls[0]; $("aout").classList.remove("hidden"); play();
});
$("pp").onclick = () => playing ? pause() : play();
$("rp").onclick = () => { if (!urls.length) return; fi = 0; $("stage").src = urls[0]; play(); };
$("spd").oninput = () => { if (playing) play(); };
$("adl").onclick = async () => {
  if (!urls.length) return;
  if (!window.MediaRecorder) return toast("Recording isn't supported on this browser");
  toast("Recording...");
  try {
    const c = mk(400, 400), g = c.getContext("2d"), rec = new MediaRecorder(c.captureStream(30)), ch = [];
    rec.ondataavailable = e => ch.push(e.data);
    const done = new Promise(r => rec.onstop = r);
    const ims = await Promise.all(urls.map(u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(i); i.src = u; })));
    rec.start();
    for (let l = 0; l < 3; l++) for (const i of ims) { g.fillStyle = "#0b1424"; g.fillRect(0, 0, 400, 400); g.drawImage(i, 0, 0, 400, 400); await wait(delay()); }
    rec.stop(); await done;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(ch, { type: rec.mimeType || "video/webm" }));
    a.download = "quest-animation.webm"; a.click();
  } catch (e) { toast("Couldn't record. Try a screen recording instead."); }
};

/* ---------- 7. PDF ---------- */
const clean = s => String(s).replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
function pdfDoc() {
  if (!window.jspdf) { toast("PDF tool didn't load. Check your internet."); return null; }
  return new window.jspdf.jsPDF();
}
function pdfText(title, paras, file) {
  const d = pdfDoc(); if (!d) return;
  const W = d.internal.pageSize.getWidth(), H = d.internal.pageSize.getHeight(), m = 15;
  let y = m + 6;
  d.setFont("helvetica", "bold"); d.setFontSize(16); d.text(clean(title), m, y); y += 10;
  d.setFont("helvetica", "normal"); d.setFontSize(11);
  paras.forEach(p => {
    d.splitTextToSize(clean(p), W - 2 * m).forEach(l => { if (y > H - m) { d.addPage(); y = m; } d.text(l, m, y); y += 6; });
    y += 4;
  });
  const n = d.getNumberOfPages();
  for (let i = 1; i <= n; i++) { d.setPage(i); d.setFontSize(8); d.text("Powered by great minds Tech", m, H - 6); }
  d.save(file);
}
$("pdfChat").onclick = () => {
  if (!chat.length) return toast("No chat yet");
  pdfText("Chat with Quest", chat.map(m => (m.role === "user" ? "You: " : "Quest: ") + m.content), "quest-chat.pdf");
};
$("pdfHw").onclick = () => {
  if (!vers.length) return toast("Make assignment versions first");
  pdfText("Assignment versions", vers.map((v, i) => "Version " + (i + 1) + "\n" + v), "quest-assignment.pdf");
};
const toData = async u => {
  const b = await (await fetch(u)).blob();
  return new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
};
$("pdfImg").onclick = async () => {
  const d = pdfDoc(); if (!d) return;
  const list = []; if (base) list.push(editedURL());
  getHist().forEach(h => list.push(h.url));
  if (!list.length) return toast("No images yet");
  toast("Building PDF...");
  const W = d.internal.pageSize.getWidth(), H = d.internal.pageSize.getHeight(), m = 12;
  let n = 0;
  for (const u of list) {
    try {
      const data = u.startsWith("data:") ? u : await toData(u);
      const im = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = data; });
      const s = Math.min((W - 2 * m) / im.width, (H - 2 * m) / im.height), w = im.width * s, h = im.height * s;
      if (n) d.addPage();
      const f = (data.match(/image\/(png|jpe?g|webp)/) || [0, "jpeg"])[1].replace("jpg", "jpeg").toUpperCase();
      d.addImage(data, f, (W - w) / 2, (H - h) / 2, w, h); n++;
    } catch (e) {}
  }
  if (!n) return toast("Couldn't load the images. Download them instead.");
  d.save("quest-gallery.pdf");
};
