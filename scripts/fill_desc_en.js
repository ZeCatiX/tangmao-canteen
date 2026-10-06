// 一次性:通过 admin API 给 29 道有中文描述的菜品补 description_en(规格短语英译)
const BASE = process.env.BASE || 'http://localhost:3000';
const ADMIN_USER = process.env.ADMIN_USER, ADMIN_PASS = process.env.ADMIN_PASS;
if (!ADMIN_USER || !ADMIN_PASS) { console.error('需要 ADMIN_USER/ADMIN_PASS 环境变量'); process.exit(1); }

const EN = {
  2070: 'About 250g fish, cleaned',
  2073: '6 pieces',
  2074: '6 pieces (brush-shaped)',
  2076: '2 minimum',
  2079: '3 minimum',
  2085: 'Original flavor',
  2090: '150g',
  2095: '150g',
  2105: '6 pieces',
  2112: 'Squid, fish maw, meatballs',
  2137: 'Chilled',
  2138: 'Chilled',
  2139: 'Chilled',
  2140: 'Room temp / chilled',
  2141: 'Recommended',
  2142: 'Recommended',
  2145: '68 yuan per pot',
  2146: '68 yuan per pot',
  2147: '68 yuan per pot',
  2148: '68 yuan per pot',
  2149: '68 yuan per pot',
  2170: 'Pineapple / orange flavor',
  2175: 'Orange / peach juice',
  2698: '68 yuan per pot',
  2699: '68 yuan per pot',
  2700: '68 yuan per pot',
  2701: '68 yuan per pot',
  2702: '68 yuan per pot',
  2711: 'Wasabi flavor',
};

(async () => {
  const login = await fetch(BASE + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  const lj = await login.json();
  if (!lj.token) { console.error('登录失败:', JSON.stringify(lj).slice(0, 200)); process.exit(1); }
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + lj.token };
  const j = await (await fetch(BASE + '/api/dishes')).json();
  let ok = 0, skip = 0, fail = 0;
  for (const d of j.dishes) {
    const en = EN[d.id];
    if (!en) { skip++; continue; }
    const r = await fetch(BASE + '/api/admin/dish/' + d.id, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ description_en: en }),
    });
    if (r.ok) ok++; else { fail++; console.error('FAIL', d.id, d.name, r.status, (await r.text()).slice(0, 120)); }
  }
  console.log(`ok=${ok} skip=${skip} fail=${fail}`);
})();
