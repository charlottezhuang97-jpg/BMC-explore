/* Conversation registry and frame bridge. Each entry keeps its own workbench and storage. */
(() => {
  window.CSRHost={create({root,getState,showView,persist,onCapture,onNavUpdate}){
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const frames=root.querySelector('#wm-session-frames');
    const taskFrame = root.querySelector('#wm-library-task-frame');
    let builtinTasks = [];
    let activeBuiltinTask = null;
    let builtinFilter = 'all';
    let pendingBuiltinTask = null;

    const phaseLabels={idle:'准备开始',running:'执行中',decision:'待确认门限',preview:'等待应用',paused:'已暂停',review:'等待验证与交付',validation_setup:'选择验证方式',simulation_review:'离线演示已完成',delivery_review:'待审阅交付',completed:'评审包已就绪',rolledback:'已撤销修改',retained:'保留原配置'};
    const isConfigurationRequest=text=>/门限|阈值/.test(text)&&/一般|告警|温度|进风/.test(text);
    function registry(){const s=getState();s.conversations=Array.isArray(s.conversations)?s.conversations:[];if(s.csrTask&&!s.conversations.some(c=>c.entryId===s.csrTask.entryId))s.conversations.unshift({...s.csrTask,title:s.csrTask.request||'进风温度 · 告警门限调整',accessedAt:Date.now()});return s.conversations;}
    function saveActive(){const s=getState();if(!s.csrTask)return;const list=registry(),i=list.findIndex(c=>c.entryId===s.csrTask.entryId);list[i]={...list[i],...s.csrTask};}
    function createConversation(request='',blank=false){saveActive();const list=registry();const task={entryId:`csr-${Date.now()}-${Math.random().toString(16).slice(2,8)}`,request,title:request||'新对话',blank,phase:'idle',revision:0,values:{minor:46,major:48},accessedAt:Date.now()};getState().csrTask=task;list.unshift(task);return task;}
    function open(request,forceNew=false){const s=getState();s.libraryCategory='chat';s.librarySelection=null;onNavUpdate?.('chat',false);registry();if(forceNew||!s.csrTask)createConversation(request||'把一般告警门限改成 50°C');s.homeDraft=s.csrTask.request;showView('configuration');persist();}
    function selectConversation(id){saveActive();const task=registry().find(c=>c.entryId===id);if(!task)return;task.accessedAt=Date.now();getState().csrTask={...task};if(getState().libraryCategory==='chat')onNavUpdate?.('chat',false);showView('configuration');persist();}
    function libraryEntries() {
      const s = getState();
      const saved = s.capturedEntries || [];
      const legacy = [['idea', s.captureRecord, 'conversationAction'], ['task', s.branchRecord, 'conversationBranch']].flatMap(([kind, item, id]) => {
        const match = item?.fromConfiguration && item.source?.match(/配置任务对话 · (.*?) · R(\d+)/);
        if (!match) return [];
        const decode = text => String(text || '').replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => ({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[entity]));
        const source = registry().find(entry => entry.entryId === match[1]);
        return [{id, kind, entryId:match[1], revision:Number(match[2]), sourceTitle:source?.title || '配置任务对话', title:decode(item.title), quote:decode(item.quote), request:decode(item.reply)}];
      });
      return [...saved, ...legacy];
    }
    function openLibrary(category, selection = null) {
      const s = getState();
      s.libraryCategory = category;
      s.librarySelection = selection;
      onNavUpdate?.(category,false);
      showView('configuration');
      persist();
    }
    function openCapture(id) {
      const entry = libraryEntries().find(item => item.id === id);
      if (!entry) return;
      const s = getState();
      s.libraryCategory = entry.kind;
      s.librarySelection = entry.id;
      onNavUpdate?.(entry.kind,false);
      if (registry().some(source => source.entryId === entry.entryId)) selectConversation(entry.entryId);
      else openLibrary(entry.kind, entry.id);
    }
    function openConversationTurn(captureId, quote = '') {
      const entry = libraryEntries().find(item => item.id === captureId);
      if (!entry || !registry().some(source => source.entryId === entry.entryId)) { openCapture(captureId); return; }
      const s = getState();
      s.libraryCategory = 'chat';
      s.librarySelection = null;
      selectConversation(entry.entryId);
      const request = entry.request || entry.messages?.at(-1) || '';
      const frame = [...frames.querySelectorAll('iframe[data-entry]')].find(item => item.dataset.entry === entry.entryId);
      if (!frame) return;
      const focus = () => frame.contentWindow?.postMessage({type:'bmc-focus-turn', request, quote}, '*');
      if (frame.contentDocument?.readyState === 'complete') requestAnimationFrame(focus);
      else frame.addEventListener('load', focus, {once:true});
    }
    function openTaskSource(anchor = 'decision') {
      openLibrary('task');
      const focus = () => taskFrame.contentWindow?.postMessage({type:'bmc-focus-task-turn', anchor}, '*');
      if (taskFrame.contentDocument?.readyState === 'complete') requestAnimationFrame(focus);
      else taskFrame.addEventListener('load', focus, {once:true});
    }
    function renderConversations(){
      const s = getState();
      const category = s.libraryCategory || 'chat';
      const q = (root.querySelector('#wm-conversation-query')?.value || '').trim().toLowerCase();
      const entries = libraryEntries();
      const branchedSources = new Set(entries.filter(entry => entry.kind === 'task').map(entry => entry.entryId));
      const matches = (...values) => values.join(' ').toLowerCase().includes(q);
      const button = (attrs, title, subtitle, current) => `<button type="button" class="conversation-item" ${attrs} aria-current="${current?'page':'false'}"><span><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></span></button>`;
      const chatList = registry()
        .filter(entry => !branchedSources.has(entry.entryId) && matches(entry.title, entry.request))
        .sort((a,b) => (b.accessedAt||0)-(a.accessedAt||0));
      const chatRows = chatList.map(entry => button(`data-conversation="${esc(entry.entryId)}"`, entry.title || '新对话', entry.general?'对话中':phaseLabels[entry.phase]||'对话中', entry.entryId===s.csrTask?.entryId));
      const capturedRows = entries.filter(entry => entry.kind === category && matches(entry.title, entry.sourceTitle, entry.quote))
        .map(entry => button(`data-open-capture="${esc(entry.id)}"`, entry.title, `来源 · ${entry.sourceTitle} · R${entry.revision}`, entry.id===s.librarySelection));
      const taskPanel = category === 'task' ? renderBuiltinTasks(matches, s.librarySelection) : '';
      const rows = category==='chat'?chatRows.join(''):taskPanel+capturedRows.join('');
      root.querySelector('#wm-conversation-list').innerHTML = rows || '<p class="conversation-empty">'+(q?'没有找到匹配的条目':category==='idea'?'从配置助手的回复中提炼想法':category==='task'?'从对话或想法分支形成任务':'还没有对话')+'</p>';
      root.querySelector('#wm-library-heading').textContent = ({chat:'BMC · 最近对话',idea:'BMC · 想法',task:'BMC · 任务'})[category];
      root.querySelectorAll('[data-library]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.library===category)));
      if (s.view === 'configuration') root.querySelector('.side .rail-button[data-view="home"]')?.setAttribute('aria-pressed', String(category === 'chat'));
      root.querySelector('.configuration-layout').classList.toggle('conversations-collapsed',!!s.conversationsCollapsed);
      root.querySelectorAll('[data-toggle-conversations]').forEach(b=>b.setAttribute('aria-expanded',String(!s.conversationsCollapsed)));
    }
    function renderBuiltinTasks(matches, selection) {
      if (!builtinTasks.length) return '<p class="conversation-empty">正在读取内置任务…</p>';
      const groups = [['attention', '需要你处理'], ['running', 'AI 执行中'], ['done', '最近完成']];
      const count = group => builtinTasks.filter(task => task.group === group).length;
      const filters = [['all', '全部'], ['attention', '需要我 '+count('attention')], ['running', '运行中 '+count('running')]];
      const toolbar = '<div class="library-task-filters" role="group" aria-label="按任务状态筛选">'+filters.map(([key,label]) =>
        `<button type="button" data-builtin-filter="${key}" aria-pressed="${key===builtinFilter}">${label}</button>`).join('')+'</div>';
      const sections = groups.map(([group,label]) => {
        if (builtinFilter!=='all' && builtinFilter!==group) return '';
        const tasks = builtinTasks.filter(task => task.group===group && matches(task.title,task.meta,task.step,task.search));
        if (!tasks.length) return '';
        const items = tasks.map(task => `<button type="button" class="conversation-item library-builtin-task" data-builtin-task="${esc(task.id)}" aria-current="${!selection&&activeBuiltinTask===task.id?'page':'false'}">
          <span><strong>${esc(task.title)}</strong><small>${esc(task.meta)}</small><small>${esc(task.step)}</small></span><b data-status="${group}">${esc(task.status)}</b></button>`).join('');
        return `<section class="library-task-group"><div>${label}<span>${tasks.length}</span></div>${items}</section>`;
      }).join('');
      return toolbar+(sections||'<p class="conversation-empty">没有匹配的内置任务</p>');
    }
    function mount(){
      const s = getState();
      const category = s.libraryCategory || 'chat';
      const entry = libraryEntries().find(item => item.id === s.librarySelection && item.kind === category);
      const context = root.querySelector('#wm-source-context');
      const builtin = category==='task' && !entry;
      taskFrame.hidden = !builtin;
      if (category==='task' && !taskFrame.getAttribute('src')) taskFrame.src = 'csr-ai-workbench/task-library.html?screen=work&embedded=task-library';
      context.hidden = category==='chat' || builtin;
      if (entry) {
        const hasSource = registry().some(source => source.entryId === entry.entryId);
        context.innerHTML = `<div class="library-context-head"><div><small>${entry.kind==='task'?'分支任务 · 待明确执行目标':'对话想法'}</small><h3>${esc(entry.title)}</h3></div>${entry.kind==='idea'?'<button type="button" data-branch-capture>从想法分支形成任务</button>':''}</div>
          <details open><summary>来源对话与上下文 · ${esc(entry.sourceTitle)} · R${entry.revision}</summary>
          <div class="library-context-copy">${(entry.messages?.length ? entry.messages : [entry.request]).map(message=>`<p><strong>你</strong> ${esc(message)}</p>`).join('')}<p><strong>配置助手</strong> ${esc(entry.quote)}</p></div>
          ${hasSource?'<button type="button" data-library-source>打开来源对话 ↗</button>':'<p>原对话入口不可用，可查看保存时的上下文。</p>'}</details>`;
      } else if (!context.hidden) {
        context.innerHTML = '<h3>想法</h3><p>选择左侧想法，查看提炼时的上下文与来源对话。</p>';
      }
      const showConversation = category==='chat' || Boolean(entry && s.csrTask?.entryId===entry.entryId);
      frames.hidden = !showConversation;
      if (!showConversation) { renderConversations(); return; }
      registry();
      if (!s.csrTask) createConversation('把一般告警门限改成 50°C');
      saveActive();
      let frame=[...frames.querySelectorAll('iframe')].find(f=>f.dataset.entry===s.csrTask.entryId);
      if(!frame){frame=frames.querySelector('iframe:not([data-entry])')||document.createElement('iframe');frame.className='configuration-frame';frame.title=s.csrTask.title||'BMC 对话与协作画布';frame.dataset.entry=s.csrTask.entryId;
        const q=new URLSearchParams({embedded:'1',entry:s.csrTask.entryId,request:s.csrTask.blank?'':s.csrTask.request,blank:s.csrTask.blank?'1':'0'});frame.src='csr-ai-workbench/index.html?'+q.toString();if(!frame.parentElement)frames.appendChild(frame);
      }
      frames.querySelectorAll('iframe').forEach(f=>f.hidden=f!==frame);renderConversations();renderHome();
    }
    function renderHome(){
      registry();const s=getState(),task=s.csrTask;if(!task)return;
      const recent=root.querySelector('.home-recent-task[data-csr-resume]');
      if(recent){recent.querySelector('strong').textContent=task.general?task.title:'进风温度 · 告警门限调整';recent.querySelector('small').textContent=task.general?'BMC 对话 · 已保留记录':`ExpBoard_1 / Inlet Temp · 工作副本 R${task.revision||0}`;recent.querySelector('em').textContent=task.general?'对话中':phaseLabels[task.phase]||'继续任务';}
      root.querySelector('#wm-bubble-title').textContent=task.general?task.title:'进风温度 · 告警门限调整';root.querySelector('#wm-bubble-status').textContent=task.general?'对话中':phaseLabels[task.phase]||'进行中';
      root.querySelector('#wm-bubble-context').textContent=task.general?'当前对话已保存，可从左侧列表切换或继续讨论。':`ExpBoard_1 / Inlet Temp · 工作副本 R${task.revision||0} · 一般 ${task.values?.minor??46}°C / 严重 ${task.values?.major??48}°C`;
      const phases=['review','validation_setup','simulation_review','delivery_review','completed'];const current=phases.includes(task.phase)?3:['decision','preview','retained'].includes(task.phase)?1:(task.stage??0)<3?0:2;
      const label=root.querySelector('#wm-bubble-step');label.textContent=task.general?'BMC 对话':`第 ${current+1} 步 / 共 4 步`;
      const c=root.querySelector('#wm-bubble-continue');c.removeAttribute('data-open-task');c.setAttribute('data-csr-resume','');c.textContent=task.general?'继续当前对话':'继续当前任务';
      const icon=root.querySelector('#wm-bubble-icon');icon.setAttribute('aria-label',task.general?'当前对话':task.phase==='completed'?'任务已完成':'任务进行中');icon.dataset.phase=task.phase;icon.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${task.general?'<path d="M21 11a8 8 0 0 1-8 8H6l-4 3V11a9 9 0 0 1 19 0Z"/>':task.phase==='completed'?'<path d="m5 12 4 4L19 6"/>':'<path d="M5 3h14M5 21h14M7 3v4c0 2 3 4 5 5-2 1-5 3-5 5v4M17 3v4c0 2-3 4-5 5 2 1 5 3 5 5v4M9 19h6"/>'}</svg>`;
    }
    const conversationQuery = root.querySelector('#wm-conversation-query');
    const conversationSearch = root.querySelector('#wm-conversation-search');
    const conversationSearchToggle = root.querySelector('[data-toggle-conversation-search]');
    function setConversationSearch(open) {
      conversationSearch.hidden = !open;
      conversationSearchToggle.setAttribute('aria-expanded', String(open));
      if (open) {
        conversationQuery.focus();
      } else if (conversationQuery.value) {
        conversationQuery.value = '';
        renderConversations();
      }
    }
    conversationSearchToggle.addEventListener('click', () => setConversationSearch(conversationSearch.hidden));
    conversationQuery.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setConversationSearch(false);
      conversationSearchToggle.focus();
    });
    root.addEventListener('click',e=>{
      const filter = e.target.closest('[data-builtin-filter]');
      if (filter) {
        builtinFilter = filter.dataset.builtinFilter;
        renderConversations();
        root.querySelector('[data-builtin-filter="'+builtinFilter+'"]')?.focus();
        return;
      }
      const builtin = e.target.closest('[data-builtin-task]');
      if (builtin) {
        const id = builtin.dataset.builtinTask;
        getState().librarySelection = null;
        openLibrary('task');
        pendingBuiltinTask = id;
        taskFrame.contentWindow.postMessage({type:'bmc-select-task', id}, '*');
        return;
      }
      const category = e.target.closest('[data-library]');
      if (category) { openLibrary(category.dataset.library); return; }
      const captured = e.target.closest('[data-open-capture]');
      if (captured) { openCapture(captured.dataset.openCapture); return; }
      const selected = libraryEntries().find(entry => entry.id === getState().librarySelection);
      if (selected && e.target.closest('[data-library-source]')) {
        getState().libraryCategory = 'chat';
        getState().librarySelection = null;
        selectConversation(selected.entryId);
        return;
      }
      if (selected && e.target.closest('[data-branch-capture]')) {
        const branch = onCapture?.({...selected, kind:'task'});
        if (branch) openCapture(branch.id);
        return;
      }
      if(e.target.closest('[data-csr-resume]'))open();
      const item=e.target.closest('[data-conversation]');if(item)selectConversation(item.dataset.conversation);
      if(e.target.closest('[data-new-conversation]')){setConversationSearch(false);createConversation('',true);openLibrary('chat');persist();}
      if(e.target.closest('[data-toggle-conversations]')){getState().conversationsCollapsed=!getState().conversationsCollapsed;renderConversations();persist();}
    });
    conversationQuery.addEventListener('input',renderConversations);
    window.addEventListener('message',e=>{
      if (e.source === taskFrame.contentWindow && e.data?.type === 'bmc-task-list' && Array.isArray(e.data.tasks)) {
        const previous = new Map(builtinTasks.map(task => [task.id, task.group]));
        builtinTasks = e.data.tasks.filter(task => task && typeof task.id === 'string');
        if (previous.size && builtinTasks.some(task => task.group === 'done' && previous.get(task.id) !== 'done')) onNavUpdate?.('task',true);
        activeBuiltinTask = e.data.active;
        const requested = pendingBuiltinTask;
        pendingBuiltinTask = null;
        if (requested && requested !== activeBuiltinTask) taskFrame.contentWindow.postMessage({type:'bmc-select-task', id:requested}, '*');
        if (getState().libraryCategory === 'task') {
          const focused = document.activeElement?.dataset.builtinTask;
          renderConversations();
          if (focused) [...root.querySelectorAll('[data-builtin-task]')].find(button => button.dataset.builtinTask===focused)?.focus();
        }
        return;
      }

      const sender=[...frames.querySelectorAll('iframe[data-entry]')].find(f=>f.contentWindow===e.source);if(!sender||e.origin!==(location.protocol==='file:'?'null':location.origin))return;
      if(e.data?.type==='csr-capture'){const d=e.data;if(!['idea','task'].includes(d.kind)||d.entryId!==sender.dataset.entry||typeof d.quote!=='string'||typeof d.request!=='string'||!Number.isFinite(d.revision))return;onCapture?.({kind:d.kind,quote:d.quote.slice(0,4000),request:d.request.slice(0,2000),entryId:d.entryId,revision:d.revision,messages:Array.isArray(d.messages)?d.messages.filter(message=>typeof message==='string').slice(-20).map(message=>message.slice(0,2000)):[]});renderConversations();return;}
      if(e.data?.type==='csr-home'){showView('home');renderHome();persist();return;}
      if(e.data?.type!=='csr-task-update')return;
      const task=e.data.task,s=getState();if(!task||task.entryId!==sender.dataset.entry||typeof task.request!=='string')return;
      if(!Object.hasOwn(phaseLabels,task.phase)||!Number.isFinite(task.revision)||!Number.isFinite(task.values?.minor)||!Number.isFinite(task.values?.major))return;
      const list=registry(),i=list.findIndex(c=>c.entryId===task.entryId);if(i<0)return;
      const previousPhase=list[i].phase;
      list[i]={...list[i],request:task.request,phase:task.phase,revision:task.revision,values:task.values,stage:task.stage,general:Boolean(task.general),packageReady:Boolean(task.packageReady),offlineComplete:Boolean(task.offlineComplete)};
      if (previousPhase !== task.phase) {
        onNavUpdate?.('chat',true);
        if (task.phase === 'completed') onNavUpdate?.('task',true);
      }
      if(list[i].title==='新对话'&&task.request.trim()){list[i].title=task.request.slice(0,50);list[i].blank=false;}
      if(s.csrTask?.entryId===task.entryId){s.csrTask={...list[i]};renderHome();}renderConversations();persist();
    });
    return {isConfigurationRequest,open,mount,renderHome,openLibrary,openConversationTurn,openTaskSource};
  }};
})();
