const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { optionalAuth } = require('../middleware/auth');
const cvService = require('../services/cvService');

const router = express.Router();

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Твърде много съобщения. Изчакайте малко и опитайте отново.' },
});

const BASE_SYSTEM_PROMPT = `Ти си "JumpStart Помощник" — чатбот на сайта JumpStart, борда за обяви за работа в България.
Отговаряй кратко (2-5 изречения), любезно и винаги на български език.

Имаш достъп до три инструмента:
- search_jobs — претърсва РЕАЛНИТЕ активни обяви в платформата в момента. Използвай го винаги, когато потребителят иска да намери работа, да види налични позиции, или иска препоръки според неговите умения/опит. Представи резултатите ясно (длъжност, компания, град, заплата) и предложи да отвори конкретна обява.
- get_my_cv — извлича запазеното CV на логнатия потребител. Ползвай го за (а) персонална обратна връзка по CV-то, и (б) за да намериш ключови думи (умения, длъжности) когато потребителят иска да му препоръчаш подходяща работа, но не е казал ясни критерии — тогава първо извикай get_my_cv, извлечи най-важните умения/опит, и с тях извикай search_jobs. Ако инструментът върне грешка "not_logged_in", кажи на потребителя да влезе в профила си. Ако върне "no_cv", предложи му да ти разкаже за себе си, за да му помогнеш да го създадеш с update_cv.
- update_cv — записва/обновява CV-то на логнатия потребител в платформата. Ползвай го, когато потребителят иска помощ да СЪЗДАДЕ или подобри автобиографията си. Води естествен разговор, за да събереш нужната информация на малки стъпки (име, кратко представяне, умения, професионален опит — длъжност/компания/период/описание, образование — учебно заведение/степен/период, езици), после извикай update_cv само с полетата, които вече знаеш (не е нужно да имаш всичко наведнъж — инструментът пази вече запазените данни и само добавя/обновява подадените полета). Ако потребителят опише свой опит с прости думи, ти самият формулирай кратко, професионално описание (2-3 изречения) преди да го запазиш. Ако инструментът върне "not_logged_in", кажи на потребителя, че трябва да влезе в профила си, за да запазиш CV-то. След всяко запазване, потвърди накратко какво си записал и покани потребителя да прегледа/довърши в "Моето CV".

Освен това помагай с:
- кандидатстване за обяви на сайта (бутон "Кандидатствай сега" в детайлите на обявата)
- публикуване на обяви (само за работодателски профили, през "Публикувай обява")
- запазване на обяви ("Запазени")
- обяснение на функции на сайта (тема, регистрация, вход)

Когато говориш за заплата, винаги посочвай сумата в евро (полето salaryRangeEur от search_jobs) — по желание добави и левовия еквивалент в скоби (salaryRangeBgn), но евро винаги е на първо място.
Ако въпросът няма връзка с работа/кариера/сайта, любезно пренасочи разговора към тези теми.
Не измисляй обяви, компании или функции, които не съществуват — винаги ползвай инструментите за реални данни.`;

// Appended only when the logged-in user is a job seeker ("candidate"), so
// the assistant proactively learns their preferences and searches jobs
// tailored to them, instead of giving generic results.
const CANDIDATE_SYSTEM_ADDENDUM = `

ВАЖНО: Текущият потребител е логнат в профила си като ТЪРСЕЩ РАБОТА (candidate).

Разпознай кога потребителят търси работа или иска препоръка за обява — включително общи фрази като "можеш ли да ми препоръчаш работа", "търся си работа", "имаш ли нещо за мен", "какви обяви има" и подобни. При такова съобщение СЛЕДВАЙ ЗАДЪЛЖИТЕЛНО тези стъпки, вместо да отговаряш с общ въпрос:
1. Веднага извикай get_my_cv, за да провериш дали вече знаеш сферата/уменията/града му от CV-то.
2. Ако от CV-то (или от по-ранни съобщения в този разговор) вече е ясна поне сфера/умение И град/дистанционна работа — веднага извикай search_jobs с тези филтри и покажи резултати. Не питай повторно за нещо, което вече знаеш.
3. Ако все още липсва сфера/умение ИЛИ град/дистанционна работа, задай точно ЕДИН кратък конкретен въпрос за липсващото — напр. "В коя сфера/каква позиция търсиш работа?" или "В кой град, или предпочиташ дистанционна работа?". Не отговаряй с общо "как мога да помогна" — потребителят вече каза, че търси работа.
4. Щом получиш отговора, веднага извикай search_jobs с наличните филтри — не чакай допълнителни детайли, освен ако резултатите са твърде общи.`;

function buildSystemPrompt(role) {
  return role === 'candidate' ? BASE_SYSTEM_PROMPT + CANDIDATE_SYSTEM_ADDENDUM : BASE_SYSTEM_PROMPT;
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_jobs',
      description: 'Search the real active job listings on JumpStart. Use whenever the user wants to find a job, see openings, or asks for recommendations.',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: 'Job title, skill, or company keyword to search for' },
          city: { type: 'string', description: 'A Bulgarian city name to filter by, e.g. "София". Omit for all cities.' },
          category: { type: 'string', description: 'One of: it, sales, design, logistics, admin, health, hr, customer' },
          remoteOnly: { type: 'boolean', description: 'true to only show remote-friendly jobs' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_cv',
      description: "Fetch the logged-in user's saved CV (summary, skills, experience, education, languages) to give tailored feedback. Only works if the user is logged in and has created a CV.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_cv',
      description: "Create or partially update the logged-in user's CV from information gathered in the conversation. Only include fields you actually have — omitted fields keep their previously saved value. Only works if the user is logged in.",
      parameters: {
        type: 'object',
        properties: {
          fullName: { type: 'string', description: "The person's full name" },
          email: { type: 'string' },
          phone: { type: 'string' },
          city: { type: 'string', description: 'A Bulgarian city name' },
          summary: { type: 'string', description: 'Short professional summary, 2-4 sentences, written in Bulgarian' },
          skills: { type: 'array', items: { type: 'string' }, description: 'Full replacement list of skills, e.g. ["JavaScript", "Excel"]' },
          experience: {
            type: 'array',
            description: 'Full replacement list of work experience entries',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                company: { type: 'string' },
                period: { type: 'string', description: 'e.g. "2021 - 2024"' },
                description: { type: 'string' },
              },
            },
          },
          education: {
            type: 'array',
            description: 'Full replacement list of education entries',
            items: {
              type: 'object',
              properties: {
                school: { type: 'string' },
                degree: { type: 'string' },
                period: { type: 'string', description: 'e.g. "2017 - 2021"' },
              },
            },
          },
          languages: { type: 'array', items: { type: 'string' }, description: 'Full replacement list of languages, e.g. ["Английски", "Немски"]' },
        },
      },
    },
  },
];

async function searchJobsTool(args = {}) {
  const clauses = [];
  const params = [];
  if (args.keyword) {
    params.push(`%${args.keyword}%`);
    clauses.push(`(title ILIKE $${params.length} OR company ILIKE $${params.length})`);
  }
  if (args.city) {
    params.push(args.city);
    clauses.push(`city = $${params.length}`);
  }
  if (args.category) {
    params.push(args.category);
    clauses.push(`category = $${params.length}`);
  }
  if (args.remoteOnly) {
    clauses.push('is_remote = true');
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const result = await db.query(
    `SELECT id, title, company, city, salary_min, salary_max, is_remote, type
     FROM jobs ${where}
     ORDER BY created_at DESC LIMIT 5`,
    params
  );

  if (result.rows.length === 0) return { results: [], note: 'Няма намерени обяви по тези критерии.' };
  // Bulgaria's euro adoption uses the fixed currency-board peg (1 EUR = 1.95583 BGN).
  // Compute the euro range here (not in the model) so the AI never has to do the
  // conversion math itself and can just quote these numbers directly.
  const BGN_PER_EUR = 1.95583;
  return {
    results: result.rows.map((r) => ({
      id: r.id,
      title: r.title,
      company: r.company,
      city: r.city,
      remote: r.is_remote,
      type: r.type,
      salaryRangeEur: r.salary_min && r.salary_max
        ? `${Math.round(r.salary_min / BGN_PER_EUR)}-${Math.round(r.salary_max / BGN_PER_EUR)}`
        : null,
      salaryRangeBgn: r.salary_min && r.salary_max ? `${r.salary_min}-${r.salary_max}` : null,
    })),
  };
}

async function getMyCvTool(userId) {
  if (!userId) return { error: 'not_logged_in' };
  const result = await db.query('SELECT * FROM cvs WHERE user_id = $1', [userId]);
  if (result.rows.length === 0) return { error: 'no_cv' };
  const cv = result.rows[0];
  return {
    fullName: cv.full_name,
    summary: cv.summary,
    skills: cv.skills,
    experience: cv.experience,
    education: cv.education,
    languages: cv.languages,
  };
}

async function updateCvTool(args = {}, userId) {
  if (!userId) return { error: 'not_logged_in' };
  try {
    const row = await cvService.upsertCv(userId, args);
    return { ok: true, cv: cvService.serializeCv(row) };
  } catch (err) {
    if (err.status === 400) return { error: 'missing_name' };
    throw err;
  }
}

async function runTool(name, args, userId) {
  if (name === 'search_jobs') return searchJobsTool(args);
  if (name === 'get_my_cv') return getMyCvTool(userId);
  if (name === 'update_cv') return updateCvTool(args, userId);
  return { error: 'unknown_tool' };
}

router.post('/', chatLimiter, optionalAuth, async (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Липсва съобщение.' });
  }

  const token = process.env.GITHUB_MODELS_TOKEN;
  if (!token) {
    return res.status(503).json({ error: 'AI чатботът не е конфигуриран в момента.' });
  }

  try {
    const convo = [{ role: 'system', content: buildSystemPrompt(req.user && req.user.role) }, ...messages];
    let reply = null;

    // Up to 5 round trips: lets the model chain multiple tool calls (e.g.
    // read the CV, then save an update, then search jobs) before its final answer.
    for (let i = 0; i < 5 && reply === null; i++) {
      const response = await fetch('https://models.github.ai/inference/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/gpt-4o-mini',
          messages: convo,
          tools: TOOLS,
          temperature: 0.4,
          max_tokens: 400,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        console.error('GitHub Models API error:', response.status, body);
        return res.status(502).json({ error: 'Възникна грешка при връзката с AI. Опитайте отново.' });
      }

      const data = await response.json();
      const msg = data.choices && data.choices[0] && data.choices[0].message;
      if (!msg) { reply = 'Извинявайте, нещо се обърка.'; break; }

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        convo.push(msg);
        for (const call of msg.tool_calls) {
          let result;
          try {
            const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
            result = await runTool(call.function.name, args, req.user && req.user.id);
          } catch (err) {
            result = { error: 'tool_failed' };
          }
          convo.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
        }
        continue;
      }

      reply = msg.content || 'Извинявайте, нещо се обърка.';
    }

    res.json({ reply: reply || 'Извинявайте, нещо се обърка.' });
  } catch (err) {
    console.error('POST /chat failed:', err);
    res.status(500).json({ error: 'Възникна грешка. Опитайте отново.' });
  }
});

module.exports = router;
