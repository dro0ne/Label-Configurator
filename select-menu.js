/* Одинаковые выпадающие списки для всех браузеров; исходный select хранит значение. */
(function () {
  'use strict';
  var controls = new Map(), active = null, sequence = 0, menuSequence = 0, frame = 0;
  function reduced() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function close() {
    if (!active) return;
    var current = active; active = null;
    current.button.setAttribute('aria-expanded', 'false'); current.button.removeAttribute('aria-activedescendant'); current.button.removeAttribute('aria-controls');
    current.menu.inert = true; current.menu.setAttribute('aria-hidden', 'true');
    current.menu.style.pointerEvents = 'none';
    if (!current.menu.animate || reduced()) current.menu.remove();
    else current.menu.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-3px)' }], { duration: 110, fill: 'forwards' }).onfinish = function () { current.menu.remove(); };
  }
  function enabled(option) { return !option.disabled && !(option.parentElement.tagName === 'OPTGROUP' && option.parentElement.disabled); }
  function position(current) {
    var box = current.button.getBoundingClientRect(), menu = current.menu;
    if (!current.button.isConnected || !box.width || box.bottom < 0 || box.top > innerHeight || current.button.closest('[hidden],[inert]')) { close(); return; }
    var width = Math.min(innerWidth - 24, Math.max(220, box.width)); menu.style.width = width + 'px';
    var below = innerHeight - box.bottom - 12, above = box.top - 12, up = below < Math.min(200, menu.scrollHeight) && above > below;
    var height = Math.min(menu.scrollHeight, 320, Math.max(60, up ? above : below));
    menu.style.maxHeight = height + 'px'; menu.style.left = Math.max(12, Math.min(innerWidth - width - 12, box.left)) + 'px';
    menu.style.top = (up ? Math.max(8, box.top - height - 6) : box.bottom + 6) + 'px'; menu.style.transformOrigin = up ? 'bottom' : 'top';
    return up;
  }
  function highlight(index) {
    if (!active) return;
    active.index = index;
    active.items.forEach(function (item, at) { item.classList.toggle('is-highlighted', at === index); });
    var item = active.items[index];
    if (item) { active.button.setAttribute('aria-activedescendant', item.id); item.scrollIntoView({ block: 'nearest' }); }
  }
  function choose(index) {
    if (!active || !active.select.options[index] || !enabled(active.select.options[index])) return;
    var select = active.select, control = controls.get(select), changed = select.selectedIndex !== index;
    select.selectedIndex = index; close(); control.sync();
    if (changed) { select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true })); }
    control.button.focus({ preventScroll: true });
  }
  function open(control) {
    if (control.select.disabled) return;
    close(); control.sync(); control.button.focus({ preventScroll: true });
    var select = control.select, button = control.button, menu = document.createElement('div');
    menu.className = 'lc-select-menu'; menu.id = control.id + '-menu-' + (++menuSequence); menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-labelledby', button.id);
    var items = Array.from(select.options, function (option, index) {
      var item = document.createElement('div'); item.className = 'lc-select-option'; item.id = menu.id + '-option-' + index;
      item.setAttribute('role', 'option'); item.setAttribute('aria-selected', String(index === select.selectedIndex));
      item.setAttribute('aria-disabled', String(!enabled(option))); item.textContent = option.label;
      item.addEventListener('pointermove', function (event) { if (event.pointerType !== 'touch' && enabled(option)) highlight(index); });
      item.addEventListener('click', function () { choose(index); }); menu.appendChild(item); return item;
    });
    document.body.appendChild(menu);
    active = { select: select, button: button, menu: menu, items: items, index: select.selectedIndex };
    var up = position(active); if (!active) return;
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-controls', menu.id);
    highlight(select.selectedIndex);
    if (menu.animate && !reduced()) menu.animate([{ opacity: 0, transform: 'translateY(' + (up ? '4px' : '-4px') + ') scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 170, easing: 'cubic-bezier(.22,1,.36,1)' });
    menu.addEventListener('pointerdown', function (event) { event.preventDefault(); });
  }
  function enhance(select) {
    if (controls.has(select) || select.multiple || select.size > 1) return;
    var shell = document.createElement('span'), button = document.createElement('button'), text = document.createElement('span');
    var id = 'lc-select-' + (++sequence), originalLabel = select.getAttribute('aria-label') || select.title;
    if (!originalLabel && select.closest('label')) originalLabel = Array.from(select.closest('label').childNodes).filter(function (n) { return n.nodeType === 3; }).map(function (n) { return n.textContent.trim(); }).join(' ');
    shell.className = 'lc-select'; button.type = 'button'; button.id = id; button.className = 'lc-select-trigger';
    button.setAttribute('role', 'combobox'); button.setAttribute('aria-haspopup', 'listbox'); button.setAttribute('aria-expanded', 'false');
    text.className = 'lc-select-value'; button.appendChild(text);
    button.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    select.before(shell); shell.appendChild(select); shell.appendChild(button);
    select.classList.add('lc-select-native'); select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
    var control = { select: select, button: button, id: id, sync: function () {
      var option = select.options[select.selectedIndex], value = option ? option.label : '';
      if (text.textContent !== value) text.textContent = value;
      button.disabled = select.disabled; button.title = value;
      button.setAttribute('aria-label', (originalLabel ? originalLabel + ': ' : '') + value);
      if (active && active.select === select && (select.disabled || select.closest('[hidden],[inert]'))) close();
    } };
    controls.set(select, control); control.sync();
    select.addEventListener('change', control.sync);
    new MutationObserver(control.sync).observe(select, { attributes: true, childList: true, subtree: true, characterData: true });
    button.addEventListener('click', function () { if (active && active.select === select) close(); else open(control); });
    button.addEventListener('focus', control.sync);
    var search = '', lastKey = 0;
    button.addEventListener('keydown', function (event) {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].indexOf(event.key) !== -1) {
        event.preventDefault();
        if (event.key === 'Escape') { close(); return; }
        if (event.key === 'Enter' || event.key === ' ') { if (active && active.select === select) choose(active.index); else open(control); return; }
        if (!active || active.select !== select) open(control);
        if (!active) return;
        var available = Array.from(select.options).map(function (o, i) { return enabled(o) ? i : -1; }).filter(function (i) { return i >= 0; });
        var at = available.indexOf(active.index), next = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : (at + (event.key === 'ArrowUp' ? -1 : 1) + available.length) % available.length;
        if (available.length) highlight(available[next]);
      } else if (event.key === 'Tab') close();
      else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault(); search = Date.now() - lastKey > 700 ? event.key : search + event.key; lastKey = Date.now();
        if (!active || active.select !== select) open(control);
        var index = Array.from(select.options).findIndex(function (o) { return enabled(o) && o.label.toLocaleLowerCase().startsWith(search.toLocaleLowerCase()); });
        if (index >= 0) highlight(index);
      }
    });
    var label = select.closest('label');
    if (label) label.addEventListener('click', function (event) { if (event.target === label) { event.preventDefault(); button.focus(); } });
  }
  function scan(root) { if (root.matches && root.matches('select')) enhance(root); if (root.querySelectorAll) root.querySelectorAll('select').forEach(enhance); }
  scan(document);
  new MutationObserver(function (records) { records.forEach(function (record) { record.addedNodes.forEach(function (node) { if (node.nodeType === 1) scan(node); }); }); }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('pointerdown', function (event) { if (active && !active.menu.contains(event.target) && !active.button.contains(event.target)) close(); }, true);
  document.addEventListener('scroll', function (event) { if (active && !active.menu.contains(event.target)) position(active); }, true);
  window.addEventListener('resize', close);
  function refresh() { if (!frame) frame = requestAnimationFrame(function () { frame = 0; controls.forEach(function (control, select) { if (!select.isConnected) controls.delete(select); else control.sync(); }); }); }
  ['input', 'change', 'selectionchange'].forEach(function (event) { document.addEventListener(event, refresh, true); });
}());
