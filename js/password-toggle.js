/**
 * 密码输入框 显示/隐藏 切换
 * ─────────────────────────────────────
 * 自包含：自动注入所需 CSS，并增强页面内所有 input[type="password"]。
 * 幂等：已增强的输入框带 data-pwd-toggle 标记，重复调用安全。
 * 如有动态插入的密码框，可手动调用 window.enhancePasswordInputs() 重新增强。
 */
(function () {
  'use strict';

  // 仅注入一次样式
  if (!document.getElementById('pwd-toggle-style')) {
    const style = document.createElement('style');
    style.id = 'pwd-toggle-style';
    style.textContent =
      '.pwd-toggle-wrap{position:relative;display:flex;align-items:center;width:100%;}' +
      '.pwd-toggle-wrap>input{flex:1 1 auto;min-width:0;padding-right:2.6rem;box-sizing:border-box;}' +
      '.pwd-toggle-wrap .pwd-toggle-btn{' +
      'position:absolute;right:0.4rem;top:50%;transform:translateY(-50%);' +
      'width:auto;height:auto;margin:0;padding:0.35rem;' +
      'background:transparent;border:0;border-radius:0;' +
      'font-size:1rem;font-weight:400;line-height:1;cursor:pointer;' +
      'color:var(--text-light,#999);z-index:5;' +
      'display:inline-flex;align-items:center;justify-content:center;' +
      '}' +
      '.pwd-toggle-wrap .pwd-toggle-btn:hover{color:var(--primary-accent,#b83a2a);background:transparent;}' +
      '.pwd-toggle-wrap .pwd-toggle-btn:focus-visible{outline:2px solid var(--primary-accent,#b83a2a);outline-offset:1px;border-radius:4px;}' +
      '.pwd-toggle-wrap .pwd-toggle-btn .bi{font-size:1.05rem;line-height:1;}';
    document.head.appendChild(style);
  }

  const ICON_HIDDEN = 'bi-eye'; // 密码当前隐藏 → 点击显示
  const ICON_SHOWN = 'bi-eye-slash'; // 密码当前显示 → 点击隐藏

  function setState(input, btn, shown) {
    input.type = shown ? 'text' : 'password';
    const icon = btn.querySelector('i');
    if (icon) {
      icon.className = 'bi ' + (shown ? ICON_SHOWN : ICON_HIDDEN);
    }
    btn.setAttribute('aria-label', shown ? '隐藏密码' : '显示密码');
    btn.setAttribute('aria-pressed', shown ? 'true' : 'false');
    btn.title = shown ? '隐藏密码' : '显示密码';
  }

  function enhance(scope) {
    const root = scope || document;
    const inputs = root.querySelectorAll('input[type="password"]:not([data-pwd-toggle])');
    Array.prototype.forEach.call(inputs, function (input) {
      input.setAttribute('data-pwd-toggle', '');
      // 若已被包裹则跳过
      if (input.parentElement && input.parentElement.classList.contains('pwd-toggle-wrap')) {
        return;
      }

      const wrap = document.createElement('div');
      wrap.className = 'pwd-toggle-wrap';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pwd-toggle-btn';
      btn.setAttribute('aria-label', '显示密码');
      btn.title = '显示密码';
      btn.innerHTML = '<i class="bi ' + ICON_HIDDEN + '"></i>';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        setState(input, btn, input.type === 'password');
      });
      wrap.appendChild(btn);
    });
    return inputs.length;
  }

  // 对外暴露，供动态插入表单后重新调用
  window.enhancePasswordInputs = enhance;

  function init() {
    enhance(document);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
