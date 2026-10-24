// 逐个审慎更新67道菜的咸淡/甜酸/过敏原/热量/素食/清真
const { Pool } = require('pg');
const p = new Pool({ host: 'localhost', port: 5432, database: 'tangmao', user: 'postgres', password: 'TangMao2026!' });
// [菜名, 咸淡, 甜酸, {过敏原JSON}, 热量, 素食, 清真]
const D = [
  ['唐猫酸汤锅子鱼', '适中', '偏酸', '{"seafood":true}', '高', false, false],
  ['葫芦鸡', '适中', '无味', '{}', '高', false, false],
  ['唐僧望塔酥', '适中', '偏甜', '{"gluten":true,"egg":true}', '中', false, false],
  ['大唐妃子笑', '适中', '偏甜', '{"seafood":true}', '中', false, false],
  ['大唐毛笔酥', '适中', '偏甜', '{"gluten":true,"egg":true}', '中', false, false],
  ['凉皮', '适中', '偏酸', '{"gluten":true}', '低', true, false],
  ['迷你肉夹馍', '适中', '无味', '{"gluten":true}', '中', false, false],
  ['玫瑰凉糕', '清淡', '偏甜', '{}', '中', true, false],
  ['笼笼肉夹馍', '偏咸', '无味', '{"gluten":true}', '高', false, false],
  ['核桃包', '清淡', '偏甜', '{"gluten":true}', '中', true, false],
  ['甑糕', '清淡', '偏甜', '{}', '中', true, false],
  ['西府一口香', '偏咸', '偏酸', '{"gluten":true}', '中', false, false],
  ['回坊酸辣汤', '适中', '偏酸', '{"gluten":true,"soy":true}', '低', false, true],
  ['油泼面', '适中', '无味', '{"gluten":true}', '中', true, false],
  ['手工奶皮子酸奶', '清淡', '偏甜', '{}', '低', true, false],
  ['一口脆虾球', '适中', '无味', '{"seafood":true}', '中', false, false],
  ['三色素锦拌魔芋', '清淡', '无味', '{}', '低', true, false],
  ['渭南酒碟子', '适中', '偏酸', '{"gluten":true}', '低', false, false],
  ['嫩豌豆拌核桃仁', '清淡', '无味', '{}', '中', true, false],
  ['浸汁酥带鱼', '适中', '偏酸', '{"seafood":true}', '中', false, false],
  ['椰椰肉', '清淡', '偏甜', '{}', '中', true, false],
  ['回坊腊牛肉', '偏咸', '无味', '{}', '中', false, true],
  ['大荔大刀肘片', '偏咸', '无味', '{}', '高', false, false],
  ['关中浆水土豆片', '清淡', '偏酸', '{}', '低', true, false],
  ['香葱野菌菇', '清淡', '无味', '{}', '低', true, false],
  ['镇巴香肠', '偏咸', '无味', '{}', '高', false, false],
  ['蔬菜沙拉', '清淡', '偏酸', '{}', '低', true, false],
  ['炝拌海参丝', '适中', '无味', '{"seafood":true}', '低', false, false],
  ['手拌牛肉', '适中', '无味', '{}', '中', false, false],
  ['香辣陕南豆干', '适中', '无味', '{"soy":true}', '低', true, false],
  ['百合马家芹', '清淡', '无味', '{}', '低', true, false],
  ['醋泡花生米', '清淡', '偏酸', '{"peanut":true}', '中', true, false],
  ['油炸花生米', '清淡', '无味', '{"peanut":true}', '中', true, false],
  ['捞汁海蜇丝', '适中', '偏酸', '{"seafood":true}', '低', false, false],
  ['乾隆白菜', '清淡', '偏酸', '{}', '低', true, false],
  ['葫芦鸡翅', '适中', '无味', '{}', '中', false, false],
  ['紫阳蒸盆子', '适中', '无味', '{}', '高', false, false],
  ['镇巴山笋炒腊肉', '偏咸', '无味', '{}', '中', false, false],
  ['虎皮凤爪', '适中', '无味', '{}', '中', false, false],
  ['茴香拌煎饼', '清淡', '无味', '{"gluten":true,"egg":true}', '中', true, false],
  ['乌龙茶香虾球', '适中', '无味', '{"seafood":true}', '中', false, false],
  ['鲜玉米糕', '清淡', '偏甜', '{"egg":true,"gluten":true}', '中', true, false],
  ['烧三鲜', '适中', '无味', '{"seafood":true,"gluten":true,"egg":true}', '中', false, false],
  ['杂粮煨排骨', '适中', '无味', '{}', '高', false, false],
  ['褒河豆腐鱼', '适中', '无味', '{"seafood":true,"soy":true}', '中', false, false],
  ['大荔带把肘子', '偏咸', '无味', '{}', '高', false, false],
  ['秦川牛仔骨', '适中', '无味', '{}', '高', false, false],
  ['仁贵涮牛肚', '适中', '无味', '{}', '中', false, false],
  ['石锅豆腐', '适中', '无味', '{"soy":true}', '中', true, false],
  ['山笋炒吊龙', '适中', '无味', '{}', '中', false, false],
  ['油泼香椿鳝丝', '适中', '无味', '{"seafood":true}', '中', false, false],
  ['辣炒牛肚', '偏咸', '无味', '{}', '中', false, false],
  ['烟笋炒肉', '适中', '无味', '{}', '中', false, false],
  ['沙葱炒鸡蛋', '清淡', '无味', '{"egg":true}', '低', true, false],
  ['浆水菜狮子头', '适中', '偏酸', '{"gluten":true,"egg":true}', '高', false, false],
  ['山药木耳', '清淡', '无味', '{}', '低', true, false],
  ['茴香小酥肉', '适中', '无味', '{"gluten":true,"egg":true}', '高', false, false],
  ['红烩牛肉', '适中', '偏酸', '{}', '中', false, false],
  ['石锅凉粉', '适中', '无味', '{}', '低', true, false],
  ['油泼豆腐', '适中', '无味', '{"soy":true}', '中', true, false],
  ['鱼头豆腐汤', '清淡', '无味', '{"seafood":true,"soy":true}', '中', false, false],
  ['清炒时蔬', '清淡', '无味', '{}', '低', true, false],
  ['半汤小青菜', '清淡', '无味', '{}', '低', true, false],
  ['白灼罗马生菜', '清淡', '无味', '{}', '低', true, false],
  ['一统江湖', '适中', '无味', '{"seafood":true}', '中', false, false],
  ['白灼虾', '清淡', '无味', '{"seafood":true}', '低', false, false],
  ['清蒸多宝鱼', '清淡', '无味', '{"seafood":true}', '低', false, false],
];
(async () => {
  let updated = 0;
  for (const d of D) {
    const r = await p.query(
      "UPDATE dishes SET saltiness=$1,sweetness=$2,allergies=$3,calorie=$4,is_vegetarian=$5,is_halal=$6 WHERE name=$7 AND category NOT IN ('飲品与酒水','主食')",
      [d[1], d[2], d[3], d[4], d[5], d[6], d[0]]
    );
    if (r.rowCount > 0) {
      updated++;
    } else {
      console.log('未找到:' + d[0]);
    }
  }
  console.log('更新' + updated + '/' + D.length + '道菜');
  const v = await p.query(
    "SELECT is_vegetarian,COUNT(*) FROM dishes WHERE category NOT IN ('飲品与酒水','主食') GROUP BY is_vegetarian"
  );
  console.log('素食:', v.rows.map((d) => d.is_vegetarian + ':' + d.count).join(', '));
  const h = await p.query(
    "SELECT is_halal,COUNT(*) FROM dishes WHERE category NOT IN ('飲品与酒水','主食') GROUP BY is_halal"
  );
  console.log('清真:', h.rows.map((d) => d.is_halal + ':' + d.count).join(', '));
  const a = await p.query(
    "SELECT COUNT(*) FROM dishes WHERE allergies::text!='{}' AND category NOT IN ('飲品与酒水','主食')"
  );
  console.log('有过敏原:', a.rows[0].count, '道');
  const c = await p.query(
    "SELECT calorie,COUNT(*) FROM dishes WHERE category NOT IN ('飲品与酒水','主食') GROUP BY calorie ORDER BY calorie"
  );
  console.log('热量:', c.rows.map((d) => d.calorie + ':' + d.count).join(', '));
  p.end();
})().catch((e) => {
  console.error(e.message);
  p.end();
});
