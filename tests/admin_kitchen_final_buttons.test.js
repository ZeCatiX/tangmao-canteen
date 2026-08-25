// 唐猫庭院 - 管理后台HTML元素验证（不依赖page.goto，直接检查HTML内容）
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const ROOT = path.join(__dirname, '..');

async function getHtml(path) {
  const r = await fetch(BASE + path);
  return r.text();
}

describe('管理后台HTML元素验证', () => {
  it('1.1 admin.html 包含退出登录链接', async () => {
    const html = await getHtml('/admin');
    assert.ok(html.includes('admin-logout-link'), '应包含退出登录链接');
    assert.ok(html.includes('admin-logout-link-mobile'), '应包含移动端退出登录链接');
    assert.ok(html.includes('退出登录'), '退出登录文字应正常');
  });

  it('2.1 admin.html 包含菜品编辑按钮', async () => {
    const html = await getHtml('/admin');
    assert.ok(html.includes('add-dish-btn'), '应包含添加菜品按钮');
    assert.ok(html.includes('save-dish-btn'), '应包含保存菜品按钮');
    assert.ok(html.includes('delete-dish-btn'), '应包含删除菜品按钮');
    assert.ok(html.includes('dish-image-file'), '应包含菜品图片文件输入');
    assert.ok(html.includes('dish-image-upload'), '应包含菜品图片上传按钮');
  });

  it('3.1 admin.html 包含通知栏', async () => {
    const html = await getHtml('/admin');
    assert.ok(html.includes('notification-bar'), '应包含通知栏');
  });

  it('4.1 admin.html 包含数据分析图表canvas', async () => {
    const html = await getHtml('/admin');
    assert.ok(html.includes('daily-trend-chart'), '应包含每日趋势图表');
    assert.ok(html.includes('pref-pie-chart'), '应包含偏好饼图');
    assert.ok(html.includes('user-activity-chart'), '应包含用户活跃度图表');
  });

  it('5.1 admin.html 包含偏好统计看板', async () => {
    const html = await getHtml('/admin');
    const prefIds = ['pref-spiciness', 'pref-saltiness', 'pref-sweetness', 'pref-price', 'pref-calorie', 'pref-religion'];
    for (const id of prefIds) {
      assert.ok(html.includes(id), `应包含 ${id} 偏好统计看板`);
    }
  });

  it('6.1 admin.html 包含模型管理训练按钮', async () => {
    const html = await getHtml('/admin');
    assert.ok(html.includes('retrain-btn'), '应包含重训练按钮');
    assert.ok(html.includes('retrain-status'), '应包含训练状态显示');
    assert.ok(html.includes('model-mgr-version'), '应包含模型版本显示');
    assert.ok(html.includes('model-mgr-time'), '应包含模型训练时间显示');
    assert.ok(html.includes('model-mgr-r2'), '应包含模型R2显示');
    assert.ok(html.includes('model-compare-table'), '应包含模型对比表格');
  });

  it('7.1 admin.html 包含仪表盘统计卡片', async () => {
    const html = await getHtml('/admin');
    assert.ok(html.includes('stat-cards'), '应包含统计卡片容器');
    assert.ok(html.includes('popular-table'), '应包含热门菜品排行表格');
    assert.ok(html.includes('model-version'), '应包含模型版本显示');
    assert.ok(html.includes('model-r2'), '应包含R2值显示');
  });

  it('8.1 admin.html 包含所有侧边栏菜单项', async () => {
    const html = await getHtml('/admin');
    const pages = ['dashboard', 'dishes', 'users', 'feedback', 'preferences', 'analytics', 'model', 'apidocs'];
    for (const p of pages) {
      assert.ok(html.includes(`data-page="${p}"`), `应包含 data-page="${p}" 菜单项`);
    }
  });

  it('9.1 admin.html 包含用户管理页面元素', async () => {
    const html = await getHtml('/admin');
    assert.ok(html.includes('page-users'), '应包含用户管理页面');
    assert.ok(html.includes('user-table-body'), '应包含用户表格');
  });

  it('10.1 admin.html 包含API文档页面', async () => {
    const html = await getHtml('/admin');
    assert.ok(html.includes('page-apidocs'), '应包含API文档页面');
  });
});