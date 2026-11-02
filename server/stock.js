'use strict';
// 唐猫庭院 · 估清共享逻辑(2026-11-02 对标商龙库存扣减)
// 日切懒式触发: dishes.stock_date<>今天则重置 sold_today/is_sold_out(新一天自动有货), 免定时任务;
// daily_stock 保留(管理员设一次, 每天同备量生效)。挂点=菜数据两个消费点: GET /api/dishes 与 下单/加菜。
// 同步内存 dishData: 不然 /api/dishes 快照滞后, 菜单错显昨日售罄直到重启。

module.exports = {
  async ensureStockDate(pool, state, logger) {
    try {
      const r = await pool.query(
        `UPDATE dishes SET sold_today=0, is_sold_out=FALSE, stock_date=CURRENT_DATE
         WHERE stock_date IS DISTINCT FROM CURRENT_DATE RETURNING id`
      );
      for (const row of r.rows) {
        const mem = state.dishData.find((x) => parseInt(x.id) === parseInt(row.id));
        if (mem) {
          mem.sold_today = 0;
          mem.is_sold_out = false;
        }
      }
      if (r.rowCount > 0) logger.info('估清日切: 已复位 ' + r.rowCount + ' 道菜');
    } catch (e) {
      if (e.code !== '42703') logger.error('估清日切失败: ' + e.message); // 42703=列未就绪, 估清是增强不阻塞点餐
    }
  },
};
