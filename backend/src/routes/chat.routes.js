const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Твърде много съобщения. Изчакайте малко и опитайте отново.' },
});

const SYSTEM_PROMPT = `Ти си "JumpStart Помощник" — чатбот на сайта JumpStart, борда за обяви за работа в България.
Отговаряй кратко (2-5 изречения), любезно и винаги на български език.

Имаш достъп до два инструмента:
- search_jobs — претърсва РЕАЛНИТЕ активни обяви в платформата в момента. Използвай го винаги, когато потребителят иска да намери работа, да види налични позиции, или иска препоръки според неговите умения/опит. Представи резултатите ясно (длъжност, компания, град, заплата) и предложи да отвори конкретна обява.
- get_my_cv — извлича запазеното CV на логнатия потребител, за да му дадеш конкретна, персонална обратна връзка: какво липсва, кои умения да добави, как да подобри описанието си. Ако инструментът върне грешка "not_logged_in", кажи на потребителя да влезе в профила си. Ако върне "no_cv", насочи го към "Моето CV", за да си създаде автобиография.

Освен това помагай с:
- кандидатстване за обяви на сайта (бутон "Кандидатствай сега" в детайлите на обявата)
- публикуване на обяви (само за работодателски профили, през "Публикувай обява")
- запазване на обяви ("Запазени")
- обяснение на функции на сайта (тема, регистрация, вход)

Заплатите се показват първо в евро, после в лева (курс 1.95583 лв. = 1 евро).
Ако въпросът няма връзка с работа/кариера/сайта, любезно пренасочи разговора към тези теми.
Не измисляй обяви, компании или функции, които не съществуват — винаги ползвай инструментите за реални данни.`;

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
  return {
    results: result.rows.map((r) => ({
      id: r.id,
      title: r.title,
      company: r.company,
      city: r.city,
      remote: r.is_remote,
      type: r.type,
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

async function runTool(name, args, userId) {
  if (name === 'search_jobs') return searchJobsTool(args);
  if (name === 'get_my_cv') return getMyCvTool(userId);
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
    const convo = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];
    let reply = null;

    // Up to 3 round trips: lets the model call a tool, see the result, and
    // either call another tool or produce its final answer.
    for (let i = 0; i < 3 && reply === null; i++) {
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
