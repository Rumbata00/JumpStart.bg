const express = require('express');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Твърде много съобщения. Изчакайте малко и опитайте отново.' },
});

const SYSTEM_PROMPT = `Ти си "JumpStart Помощник" — чатбот на сайта JumpStart, борда за обяви за работа в България.
Отговаряй кратко (2-4 изречения), любезно и винаги на български език.
Помагай на потребителите с:
- търсене и кандидатстване за обяви на сайта
- създаване на автобиография (CV) в профила им ("Моето CV")
- публикуване на обяви (само за работодателски профили, през "Публикувай обява")
- запазване на обяви ("Запазени")
- обяснение на функции на сайта (превключване на светла/тъмна тема, регистрация, вход)
Заплатите в обявите се показват първо в евро, после в лева (курс 1.95583 лв. = 1 евро).
Ако въпросът няма връзка с работа/кариера/сайта, любезно пренасочи разговора към тези теми.
Не измисляй функции, които не съществуват на сайта.`;

router.post('/', chatLimiter, async (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Липсва съобщение.' });
  }

  const token = process.env.GITHUB_MODELS_TOKEN;
  if (!token) {
    return res.status(503).json({ error: 'AI чатботът не е конфигуриран в момента.' });
  }

  try {
    const response = await fetch('https://models.github.ai/inference/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        temperature: 0.4,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('GitHub Models API error:', response.status, body);
      return res.status(502).json({ error: 'Възникна грешка при връзката с AI. Опитайте отново.' });
    }

    const data = await response.json();
    const reply = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : 'Извинявайте, нещо се обърка.';

    res.json({ reply });
  } catch (err) {
    console.error('POST /chat failed:', err);
    res.status(500).json({ error: 'Възникна грешка. Опитайте отново.' });
  }
});

module.exports = router;
