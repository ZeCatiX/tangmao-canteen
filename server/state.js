'use strict';
// 唐猫庭院 · 服务端共享状态访问器(2026-10-13 可维护性改造4)
// dishData 是被 loadDishData 重赋值、被 admin CRUD 原地修改的共享可变状态:
// 通过 get/set 访问器暴露,路由模块经 require('../state') 引用即可始终拿到最新数组。
let dishData = [];

module.exports = {
  get dishData() {
    return dishData;
  },
  set dishData(v) {
    dishData = v;
  },
};
