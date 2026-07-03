const { pool } = require('./db');

const CATEGORIES = ['it', 'sales', 'design', 'logistics', 'admin', 'health', 'hr', 'customer'];
const CITIES = ['София', 'Пловдив', 'Варна', 'Бургас', 'Русе', 'Стара Загора', 'Плевен'];
const EXPERIENCE = ['Без опит', '1-3 години', '3-5 години'];
const JOB_TYPES = ['Пълен работен ден', 'Непълен работен ден', 'Дистанционна работа'];

const COMPANIES = [
  { name: 'НексаТех АД', color: '#2451A3', init: 'НТ' },
  { name: 'Балкан Логистикс', color: '#C0392B', init: 'БЛ' },
  { name: 'Софтуерна Кула ЕООД', color: '#8E44AD', init: 'СК' },
  { name: 'Тракия Ритейл', color: '#2E7D4F', init: 'ТР' },
  { name: 'Медика Плюс', color: '#D35400', init: 'МП' },
  { name: 'Финанс Груп България', color: '#16233F', init: 'ФГ' },
  { name: 'Креативна Агенция Вижън', color: '#E67E22', init: 'КВ' },
  { name: 'ИндустриалСтрой ЕАД', color: '#2980B9', init: 'ИС' },
];

const TITLES = [
  ['Senior Frontend разработчик (React)', 'it'], ['Backend Java Developer', 'it'],
  ['Мениджър продажби', 'sales'], ['Търговски представител', 'sales'],
  ['UI/UX Дизайнер', 'design'], ['Графичен дизайнер', 'design'],
  ['Шофьор категория С+Е', 'logistics'], ['Логистичен координатор', 'logistics'],
  ['Офис асистент', 'admin'], ['Административен сътрудник', 'admin'],
  ['Медицинска сестра', 'health'], ['Фармацевт', 'health'],
  ['HR специалист', 'hr'], ['Специалист подбор на персонал', 'hr'],
  ['Служител обслужване на клиенти', 'customer'], ['Оператор кол център', 'customer'],
  ['DevOps инженер', 'it'], ['QA инженер', 'it'], ['Data анализатор', 'it'],
  ['Ключов клиентски мениджър', 'sales'],
];

async function seed() {
  console.log('Seeding database...');

  const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS n FROM jobs');
  if (countRows[0].n > 0) {
    console.log(`jobs table already has ${countRows[0].n} rows — skipping seed. (Drop the table or TRUNCATE it if you want to reseed.)`);
    await pool.end();
    return;
  }

  for (let i = 0; i < TITLES.length; i++) {
    const [title, category] = TITLES[i];
    const c = COMPANIES[i % COMPANIES.length];
    const city = CITIES[i % CITIES.length];
    const isRemote = i % 4 === 0;
    const salaryMin = 1200 + (i % 6) * 350;
    const salaryMax = salaryMin + 600 + (i % 3) * 400;
    const daysAgo = i < 3 ? 0 : i < 7 ? 2 : 3 + (i % 5);
    const type = isRemote ? 'Дистанционна работа' : JOB_TYPES[i % 2];

    await pool.query(
      `INSERT INTO jobs
        (owner_id, title, category, company, company_color, company_init,
         city, is_remote, type, salary_min, salary_max, experience,
         description, responsibilities, requirements, benefits, created_at)
       VALUES (NULL,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now() - ($16 || ' days')::interval)`,
      [
        title, category, c.name, c.color, c.init,
        city, isRemote, type, salaryMin, salaryMax,
        EXPERIENCE[i % EXPERIENCE.length],
        'Търсим мотивиран и отговорен кандидат, който да се присъедини към нашия екип. Ще работите в динамична среда с възможности за професионално развитие и вътрешни обучения. Ще си сътрудничите тясно с останалите отдели по ежедневни задачи и дългосрочни проекти.',
        JSON.stringify([
          'Изпълнение на ежедневните задължения, свързани с позицията',
          'Активна комуникация с колеги и партньори',
          'Участие в екипни срещи и планиране на задачите',
          'Спазване на фирмените стандарти и процедури',
        ]),
        JSON.stringify([
          'Релевантен опит на подобна позиция' + (category === 'it' ? ' — минимум 2 години' : ''),
          'Отлични комуникативни умения',
          'Владеене на английски език — писмено и говоримо',
          'Компютърна грамотност и работа с офис пакет',
        ]),
        JSON.stringify(['Допълнително здравно осигуряване', 'Карта за спорт', 'Гъвкаво работно време', '25 дни платен отпуск']),
        daysAgo,
      ]
    );
  }

  console.log(`Seeded ${TITLES.length} jobs.`);
  await pool.end();
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
