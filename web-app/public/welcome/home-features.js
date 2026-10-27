/* Global welcome actions; project capabilities remain in the IDE sidebar. */
(function () {
  'use strict';
  function send(message) { window.parent.postMessage(message, window.location.origin); }
  function openProjects() { send({ type: 'welcome-projects' }); }
  function icon(path) {
    return '<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="' + path + '"/></svg>';
  }
  var folderIcon = icon('M3 5h6l2 2h10v13H3V5z');
  var glyphs = {
    server: 'M3 3h18v8H3V3zm2 3v2h2V6H5zm4 0v2h8V6H9zM3 13h18v8H3v-8zm2 3v2h2v-2H5zm4 0v2h8v-2H9z',
    topology: 'M10 2h4v4h-4V2zm1 4h2v4h7v4h-2v-2h-5v2h-2v-2H6v2H4v-4h7V6zM2 16h6v6H2v-6zm7 0h6v6H9v-6zm7 0h6v6h-6v-6z',
    hardware: 'M6 6h12v12H6V6zm2 2v8h8V8H8zM8 1h2v4H8V1zm6 0h2v4h-2V1zM8 19h2v4H8v-4zm6 0h2v4h-2v-4zM1 8h4v2H1V8zm0 6h4v2H1v-2zm18-6h4v2h-4V8zm0 6h4v2h-4v-2z',
    logs: 'M4 2h10l6 6v14H4V2zm9 2v5h5l-5-5zM7 12v2h10v-2H7zm0 4v2h7v-2H7z',
    community: 'M8 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm9 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM1 21v-3a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v3H1zm16-9a6 6 0 0 1 6 6v3h-6v-3a8 8 0 0 0-2-5.3c.6-.5 1.3-.7 2-.7z',
    publish: 'M12 2l9 5v10l-9 5-9-5V7l9-5zm0 2.3L6 7.6l6 3.3 6-3.3-6-3.3zm-7 5v6.5l6 3.3v-6.5L5 9.3zm8 9.8l6-3.3V9.3l-6 3.3v6.5z'
  };
  // Supplied transparent artwork: neutral at rest, original color on hover/focus.
  function stageArt(kind) {
    return '<img src="./welcome/assets/stage-' + kind + '.png" alt="" aria-hidden="true" width="88" height="88" draggable="false">';
  }
  function featureIcon(glyph) {
    var paths = {
      server: ['M4 4h16a2 2 0 0 1 2 2v4H2V6a2 2 0 0 1 2-2z', 'M2 10h20v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8z', 'M8 7v3M12 7v3M16 7v3'],
      logs: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M7 14l2.2-3.6 2.3 5.2 2-3h3.5']
    };
    if (!paths[glyph]) return icon(glyphs[glyph]);
    return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + paths[glyph].map(function (path) { return '<path d="' + path + '"/>'; }).join('') + '</svg>';
  }
  function renderStages(role) {
    var machine = role === 'machine_developer';
    var stages = [
      { id: 'development', title: '开发', desc: machine ? '整机配置与适配' : '部件硬件配置与适配', items: [
        { name: machine ? '整机拓扑' : '硬件拓扑', view: machine ? 'serverView' : 'hwTopology', glyph: machine ? 'topology' : 'hardware' }
      ] },
      { id: 'debug', title: '调试', desc: '运行环境与问题定位', items: [
        { name: '环境管理', view: 'bmcEnv', glyph: 'server' },
        { name: '日志解析', view: 'logReviewer', glyph: 'logs' }
      ] },
      { id: 'release', title: '发布贡献', desc: machine ? '组件发布与社区协作' : '参与社区，共享成果', items: (machine ? [
        { name: '发布组件', external: true, placeholder: true, glyph: 'publish' }
      ] : []).concat([{ name: '社区工作台', placeholder: true, glyph: 'community' }]) }
    ];
    var root = document.getElementById('welcomeRoleStages');
    root.replaceChildren();
    stages.forEach(function (stage) {
      var card = document.createElement('section'); card.className = 'welcome-stage welcome-stage--' + stage.id;
      var art = document.createElement('div'); art.className = 'welcome-stage-art'; art.innerHTML = stageArt(stage.id);
      var heading = document.createElement('h2'); heading.className = 'welcome-stage-title'; heading.textContent = stage.title;
      var desc = document.createElement('p'); desc.className = 'welcome-stage-description'; desc.textContent = stage.desc;
      var items = document.createElement('div'); items.className = 'welcome-stage-items';
      stage.items.forEach(function (item) {
        var control = document.createElement(item.url ? 'a' : 'button'); control.className = 'welcome-stage-feature';
        var tile = document.createElement('span'); tile.className = 'welcome-stage-feature-icon'; tile.innerHTML = featureIcon(item.glyph);
        var label = document.createElement('span'); label.className = 'welcome-stage-feature-label'; label.textContent = item.name;
        if (item.url) {
          control.href = item.url; control.target = '_blank'; control.rel = 'noopener noreferrer';
          control.setAttribute('aria-label', item.name + '（在新标签页打开）');
          var external = document.createElement('span'); external.className = 'welcome-stage-external'; external.textContent = '↗'; external.setAttribute('aria-hidden', 'true'); label.appendChild(external);
        } else if (item.placeholder) {
          control.disabled = true; control.title = item.external ? '发布组件外链待配置' : '社区工作台入口占位';
          if (item.external) {
            var externalHint = document.createElement('span'); externalHint.className = 'welcome-stage-external'; externalHint.textContent = '↗'; externalHint.setAttribute('aria-hidden', 'true'); label.appendChild(externalHint);
          }
          if (item.external) {
            var status = document.createElement('span'); status.className = 'welcome-stage-pending'; status.textContent = '待配置链接'; label.appendChild(status);
          }
        } else {
          control.type = 'button'; control.addEventListener('click', function () { send({ type: 'ai-open-scenario', viewId: item.view }); });
        }
        control.append(tile, label); items.appendChild(control);
      });
      card.append(art, heading, desc, items); root.appendChild(card);
    });
  }
  var quickItems = [
    { name: '资源下载', action: 'resource-download', path: 'M11 3h2v10l3-3 1.4 1.4L12 17l-5.4-5.6L8 10l3 3V3zM4 18h16v3H4z', cmd: 'agent 下载开发资源 sdk' },
    { name: '资源贡献', action: 'community-contribution', path: 'M4 3h10l6 6v12H4V3zm9 2v5h5l-5-5zm-2 7v3H8v2h3v3h2v-3h3v-2h-3v-3z', url: 'https://discuss.openubmc.cn/' },
    { name: '发布组件', action: 'publish-component', path: 'M12 2l9 5v10l-9 5-9-5V7l9-5zm0 2.3L6 7.6l6 3.3 6-3.3-6-3.3zm-7 5v6.5l6 3.3v-6.5L5 9.3zm8 9.8l6-3.3V9.3l-6 3.3v6.5z', placeholder: true },
    { name: '资源协作接口', action: 'resource-tree', path: 'M3 3h7v7H3V3zm11 11h7v7h-7v-7zM14 3h7v7h-7V3zM3 14h7v7H3v-7zm7-8h4v2h-4V6zm-4 4h2v4H6v-4zm10 0h2v4h-2v-4zm-6 6h4v2h-4v-2z', view: 'explorer' }
  ];
  var quickRoot = document.getElementById('quickAccessItems');
  quickItems.forEach(function (item) {
    var button = document.createElement('button');
    button.className = 'btn btn-ghost welcome-quick-item';
    button.innerHTML = icon(item.path) + '<span>' + item.name + '</span>';
    if (item.placeholder) { button.disabled = true; button.title = '发布组件外链待配置'; }
    button.addEventListener('click', function () {
      if (item.cmd) send({ type: 'ai-run-agent', cmd: item.cmd });
      else if (item.view) send({ type: 'ai-open-scenario', viewId: item.view });
      else window.vscode.postMessage({ command: 'openLink', url: item.url });
    });
    quickRoot.appendChild(button);
  });
  document.getElementById('viewAllProjects').addEventListener('click', openProjects);
  function renderRecent(rows) {
    var list = document.getElementById('recentList');
    list.replaceChildren();
    rows.slice(0, 3).forEach(function (project) {
      var li = document.createElement('li');
      var button = document.createElement('button');
      button.className = 'recent-item welcome-recent-project';
      var symbol = document.createElement('span');
      symbol.className = 'recent-item-icon'; symbol.innerHTML = folderIcon;
      var content = document.createElement('span');
      content.className = 'recent-item-content';
      var name = document.createElement('span'); name.className = 'recent-item-name'; name.textContent = project.name;
      var path = document.createElement('span'); path.className = 'recent-item-path'; path.textContent = project.path;
      content.append(name, path); button.append(symbol, content); li.appendChild(button); list.appendChild(li);
      button.addEventListener('click', function () { send({ type: 'welcome-select-project', id: project.id }); });
    });
    if (!rows.length) {
      var li = document.createElement('li');
      var button = document.createElement('button');
      button.className = 'btn welcome-empty-project'; button.textContent = '浏览项目，开始工作 →';
      button.addEventListener('click', openProjects); li.appendChild(button); list.appendChild(li);
    }
  }
  window.addEventListener('message', function (event) {
    var message = event.data;
    if ((message?.type === 'updateRole' || message?.type === 'roleSelected') && ['machine_developer', 'component_developer'].includes(message.role)) {
      renderStages(message.role);
      try { localStorage.setItem('bmcDeveloperRole', message.role); } catch (_) {}
      return;
    }
    if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.type !== 'welcome-state') return;
    var state = event.data;
    renderRecent(state.recent || []);
  });
  var initialRole = 'machine_developer';
  try { if (localStorage.getItem('bmcDeveloperRole') === 'component_developer') initialRole = 'component_developer'; } catch (_) {}
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'updateRole', role: initialRole, roleName: initialRole === 'machine_developer' ? '整机开发者' : '部件开发者' } }));
  send({ type: 'welcome-ready' });
})();
