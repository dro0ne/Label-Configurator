/* Общая анимация раскрытия без фиксированной высоты содержимого. */
(function () {
  'use strict';
  var panels = new WeakMap();
  function set(element, expanded, options) {
    options = options || {};
    var panel = panels.get(element);
    if (!panel) {
      var wrapper = document.createElement('div'); wrapper.className = 'lc-disclosure-wrap';
      element.before(wrapper); wrapper.appendChild(element);
      wrapper.hidden = element.hidden || element.classList.contains('collapsed');
      panel = { wrapper: wrapper, expanded: !wrapper.hidden, animation: null }; panels.set(element, panel);
      if (window.ResizeObserver) {
        panel.resize = new ResizeObserver(function () {
          if (panel.animation && panel.expanded && Math.abs(element.getBoundingClientRect().height - panel.targetHeight) > 1) set(element, true, panel.options);
        });
        panel.resize.observe(element);
      }
    }
    var wrapper = panel.wrapper;
    if (panel.expanded === expanded && !panel.animation && element.hidden === !expanded) {
      if (options.onFinish) options.onFinish(); return;
    }
    var height = wrapper.hidden ? 0 : wrapper.getBoundingClientRect().height;
    var opacity = wrapper.hidden ? 0 : Number(getComputedStyle(wrapper).opacity);
    if (panel.animation) { panel.animation.cancel(); panel.animation = null; }
    panel.expanded = expanded;
    panel.options = options;
    wrapper.hidden = false; element.hidden = false; element.classList.remove('collapsed');
    wrapper.inert = !expanded; wrapper.setAttribute('aria-hidden', String(!expanded));
    function finish() {
      wrapper.hidden = element.hidden = !expanded;
      element.classList.toggle('collapsed', !expanded);
      wrapper.style.overflow = '';
      if (panel.animation) { panel.animation.cancel(); panel.animation = null; }
      if (options.onFinish) options.onFinish();
    }
    if (options.animate === false || !wrapper.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
    var target = expanded ? wrapper.getBoundingClientRect().height : 0;
    panel.targetHeight = target;
    wrapper.style.overflow = 'hidden';
    var animation = wrapper.animate([{ height: height + 'px', opacity: opacity }, { height: target + 'px', opacity: expanded ? 1 : 0 }],
      { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
    panel.animation = animation;
    animation.onfinish = function () { if (panel.animation === animation) finish(); };
  }
  window.__lcDisclosure = { set: set };
}());
