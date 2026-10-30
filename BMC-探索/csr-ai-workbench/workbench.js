/* Local, deterministic interaction prototype. No model or BMC endpoint is called. */
(() => {
  'use strict';
  const data = window.CSR_CASE;
  const $ = (selector) => document.querySelector(selector);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = (id, cls='') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const entryParams=new URLSearchParams(location.search);
  const embedded=entryParams.get('embedded')==='1';
  const storageKey=embedded?'openubmc-csr-workbench-embedded-v2':'openubmc-csr-workbench-demo-v1';
  const baseline = data.objects.ThresholdSensor_InletTemp;
  const definitions = [
    {id:'read', type:'上下文读取', title:'读取当前 CSR 与选中对象', icon:'file', target:'sensor', detail:'读取硬件与软件文件，识别当前对象及原始门限。'},
    {id:'locate', type:'对象定位', title:'定位芯片与采集来源', icon:'locate', target:'chip', detail:'Anchor → I2c_8 → Lm75_InletTemp；Scanner.Chip 引用此芯片。'},
    {id:'refs', type:'引用分析', title:'追踪关联告警与依赖', icon:'link', target:'minor', detail:'两个告警事件的 Condition 分别引用传感器的 UpperNoncritical 与 UpperCritical。'},
    {id:'rule', type:'约束检查', title:'检查两级告警门限', icon:'alert', target:'sensor', detail:'本原型采用“一般告警门限 < 严重告警门限”的局部规则。'},
    {id:'preview', type:'变更生成', title:'生成字段级变更预览', icon:'edit', target:'sensor', detail:'保留事件 Condition 引用，只调整当前传感器上的门限字段。'},
    {id:'apply', type:'配置修改', title:'应用到演示工作副本', icon:'edit', target:'sensor', detail:'先核对版本和旧值，再将本次字段修改作为一个整体应用。'},
    {id:'validate', type:'局部校验', title:'核对变更与引用范围', icon:'check', target:'sensor', detail:'核对门限顺序、实际差异及 8 个相关对象中的 21 处引用目标。'},
    {id:'simulate', type:'离线演示校验', title:'演示告警触发与恢复', icon:'play', target:'sensor', detail:'根据当前门限和示例 2°C 回差，计算 5 组离线输入；不连接真实设备。'},
    {id:'handoff', type:'交付生成', title:'生成 CSR 评审包', icon:'file', target:'sensor', detail:'保存当前软硬件 CSR、差异、局部检查与未验证项；不包含部署结果。'},
    {id:'runtime', type:'运行时验证', title:'验证设备告警行为', icon:'chip', target:'major', detail:'需要指定 BMC 环境、正式门限规格和固件验证能力，当前原型未连接设备。'},
  ];
  const names = {sensor:'ThresholdSensor_InletTemp', chip:'Lm75_InletTemp', scanner:'Scanner_Lm75_Inlet', minor:'Event_InletTempUpperMinor', major:'Event_InletTempUpperMajor'};
  const defaultRequest = $('#request').value;
  const fresh = () => ({schema:1, phase:'idle', stage:0, revision:0, values:{minor:baseline.UpperNoncritical,major:baseline.UpperCritical}, requested:50, proposal:null, target:'sensor', view:'graph', tasks:{}, messages:[], history:[], report:null, recovery:false, elapsed:0, activeTask:null, resumeList:[], request:defaultRequest});
  let state = fresh();
  try { const saved=JSON.parse(localStorage.getItem(storageKey)); if(saved?.schema===1) { state={...state,...saved}; if(state.phase==='running') { state.phase='paused'; if(state.activeTask) state.tasks[state.activeTask]='queued'; } } } catch {}
  const entryId=entryParams.get('entry')||'';
  const entryRequest=entryParams.get('request')||'';
  const autoStart=Boolean(entryRequest&&entryId&&state.entryId!==entryId);
  if(autoStart){state=fresh();state.entryId=entryId;state.request=entryRequest;}
  let completion;
  let generation=0, elapsedTimer=null, zoom=1, toastTimer=null;
  const persist = () => { try { localStorage.setItem(storageKey,JSON.stringify(state)); } catch {} };
  const def = (id) => definitions.find(x=>x.id===id);
  const phaseName = () => ({validation_setup:'选择验证方式',simulation_review:'离线演示完成',delivery_review:'交付审阅',completed:'评审包已就绪',idle:'原始配置',running:'AI 正在工作',decision:'发现门限冲突',preview:'方案待应用',paused:'任务已暂停',review:'局部核对完成',rolledback:'已撤销修改',retained:'已保留原配置'})[state.phase] || '配置处理中';
  const hasProposal = () => state.proposal && ['preview','running','paused'].includes(state.phase) && !state.proposal.applied;
  function showToast(text) { clearTimeout(toastTimer); $('#toast').textContent=text; $('#toast').hidden=false; toastTimer=setTimeout(()=>$('#toast').hidden=true,3500); }
  function fit() {
    const box=$('#graph-viewport').getBoundingClientRect();
    if(box.width<1||box.height<1)return;
    const graph=$('#diagram');
    const compact=box.width<620;
    graph.classList.toggle('is-compact',compact);
    graph.style.width=compact?'366px':'1020px';graph.style.height=compact?'1170px':'450px';
    graph.style.position=compact?'relative':'absolute';
    $('#graph-viewport').style.overflowY=compact?'auto':'hidden';
    const positions={sensor:[20,20],chip:[20,320],scanner:[20,540],minor:[20,760],major:[20,960]};
    for(const node of graph.querySelectorAll('.object-node')){
      const pos=compact?positions[node.dataset.target]:[node.dataset.x,node.dataset.y];
      node.style.left=pos[0]+'px';node.style.top=pos[1]+'px';node.style.width=(compact||node.dataset.target==='sensor'?326:238)+'px';
    }
    const scale=(compact?Math.min((box.width-12)/366,1):Math.min((box.width-32)/1040,(box.height-24)/450,1.25))*zoom;
    graph.style.transform=`translate(${Math.max(0,(box.width-(compact?366:1020)*scale)/2)}px, ${compact?0:(box.height-450*scale)/2}px) scale(${scale})`;
    $('#zoom-label').textContent=`${Math.round(scale*100)}%`;
  }

  function getChanges() {
    const values=hasProposal()?state.proposal.after:state.values;
    const before=hasProposal()?state.proposal.before:{minor:baseline.UpperNoncritical,major:baseline.UpperCritical};
    return ['minor','major'].filter(k=>values[k]!==before[k]).map(k=>({key:k,field:k==='minor'?'UpperNoncritical':'UpperCritical',before:before[k],after:values[k]}));
  }
  function currentSource() {
    return data.sourceText.replace(/("UpperNoncritical"\s*:\s*)46\b/,(_,prefix)=>prefix+state.values.minor).replace(/("UpperCritical"\s*:\s*)48\b/,(_,prefix)=>prefix+state.values.major);
  }
  function renderMessages() {
    const initial = state.messages.length ? state.messages.map(m=>`<div class="user-message">${esc(m)}</div>`).join('') : '';
    let copy='已选中 <strong>Inlet Temp</strong>。我会先读取配置和关联关系，发现约束冲突时请你选择，再展示具体修改。';
    if(state.stage>=1) copy=`当前一般门限 <strong>${state.values.minor}°C</strong>，严重门限 <strong>${state.values.major}°C</strong>。读取来自 <span class="text-code">Scanner_Lm75_Inlet</span>，采集周期 1000 ms。`;
    if(state.phase==='decision')copy=`一般告警候选值 <strong>${state.requested}°C</strong> 高于或等于当前严重门限 <strong>${state.values.major}°C</strong>。我已保留原配置，请先确认两级门限的取舍。`;
    if(state.phase==='preview')copy='方案已生成，右侧以候选值标明待应用字段。确认前，当前工作副本仍保持原值。';
    if(state.phase==='review')copy=`工作副本的门限已更新为 <strong>${state.values.minor}/${state.values.major}°C</strong>。局部配置核对已完成，设备行为和正式门限规格仍待验证。`;
    if(state.phase==='validation_setup')copy='配置已完成局部核对。可以离线演示告警触发与恢复，也可以记录设备验证计划后继续交付。';
    if(state.phase==='simulation_review')copy='当前门限的 5 组离线输入已计算。右侧展示告警触发和恢复的过程，接下来可审阅并生成评审包。';
    if(state.phase==='delivery_review')copy='请审阅当前字段差异及未验证项，确认后生成包含 CSR 和报告的评审包。';
    if(state.phase==='completed')copy='本次配置评审包已就绪，可下载保存或回到首页继续其他任务。设备验证仍明确保留为待执行。';
    if(state.phase==='rolledback')copy='已撤销最近一次门限修改。引用关系保持，之前的检查结果已过期。';
    if(state.phase==='retained')copy='已保留原有门限，本轮没有应用配置修改。';
    $('#messages').innerHTML=initial+`<div class="assistant-head">${icon('ai','ai-icon')}<span>配置助手</span><span class="elapsed" id="elapsed-label">${state.elapsed?`已工作 ${state.elapsed}s`:'已准备'}</span></div><div class="assistant-copy">${copy}</div>`;
  }
  function renderTasks() {
    const open=new Set([...document.querySelectorAll('.task[open]:not(.is-running)')].map(x=>x.dataset.task));
    const items=definitions.filter(x=>state.tasks[x.id]);
    if(!items.length){$('#task-area').innerHTML=`<div class="flow-card"><h3>从配置对象出发</h3><p>读取当前 CSR → 追踪依赖 → 发现冲突 → 预览变更 → 局部检查</p><button class="btn btn-solid wide" data-action="start">${icon('play')}开始配置演示</button></div>`;return;}
    const done=items.filter(x=>state.tasks[x.id]==='done').length;
    $('#task-area').innerHTML=`<div class="task-group-head"><span>本次工作 · ${items.length} 项任务</span><span>${done} 已完成</span></div>`+items.map(t=>{
      const status=state.tasks[t.id], running=status==='running', conflict=status==='conflict';
      const label=({running:'进行中',done:'已完成',conflict:'待决策',queued:'已暂停',waiting:'未执行'})[status];
      let detail=t.detail;
      if(t.id==='read'&&state.recovery)detail+=' <div class="task-recovered">严格 JSON 解析曾失败：第 6 行含 // 注释。已采用识别字符串的注释兼容解析重试；源文件未被改写。</div>';
      if(t.id==='refs'&&status==='done')detail+=' <div class="text-code">Condition = &lt;=/ThresholdSensor_InletTemp.UpperNoncritical</div>';
      if(t.id==='rule'&&conflict)detail+=`<div class="task-recovered">候选：${state.requested} &lt; ${state.values.major} 不成立；未应用修改。</div>`;
      if(t.id==='validate'&&status==='done')detail+='<div>目标对象可解析 21 / 21；运行时属性和值未验证。</div>';
      return `<details class="task ${running?'is-running':''}" data-task="${t.id}" ${open.has(t.id)||running?'open':''}><summary><span class="task-symbol">${running?'<span class="spinner"></span>':icon(t.icon)}</span><span class="task-title"><strong>${t.title}</strong><small>${t.type}</small></span><span class="task-state ${running?'running':conflict?'conflict':status==='done'?'done':''}">${label}</span></summary><div class="task-body">${detail}<br><button class="btn btn-ghost btn-sm" data-action="locate" data-target="${t.target}">${icon('locate')}定位相关对象</button></div></details>`;
    }).join('');
  }
  function renderDecisions() {
    const el=$('#decision-area');
    if(state.phase==='decision') {
      el.innerHTML=`<form id="decision-form" class="flow-card is-warning"><h3>${icon('alert')}需要确认门限关系</h3><p>一般告警 ${state.requested}°C 会先越过严重门限 ${state.values.major}°C。请确认是否同时调整严重门限。</p><label class="option"><input type="radio" name="choice" value="adjust" checked><span><strong>同时调整严重门限，保留一般门限 ${state.requested}°C</strong></span></label><label class="option"><input type="radio" name="choice" value="retain"><span><strong>保留 ${state.values.minor}/${state.values.major}°C，取消本次修改</strong></span></label><label class="field-entry" for="major-input">严重告警门限（°C）<input id="major-input" type="number" value="${Math.max(55,state.requested+5)}" step="any" required></label><div class="helper">填入值仅用于演示工作副本；正式配置需要核对产品散热规格。</div><div id="decision-error" class="error-text" role="alert"></div><button class="btn btn-solid wide" type="submit">确认方案，生成预览</button></form>`;
    } else if(state.phase==='preview') {
      const changes=getChanges();
      el.innerHTML=`<div class="flow-card"><h3>${icon('edit')}变更预览 · ${changes.length} 个字段</h3><p>一般门限 ${state.values.minor} → ${state.proposal.after.minor}°C<br>严重门限 ${state.values.major} → ${state.proposal.after.major}°C</p><div class="helper">两个告警事件保持引用。当前配置未写入，等待你应用。</div><div class="action-row"><button class="btn btn-solid" data-action="apply">应用到工作副本</button><button class="btn" data-action="view-changes">查看差异</button><button class="btn btn-ghost" data-action="edit-choice">调整方案</button></div></div>`;
    } else el.innerHTML='';
  }
  function renderResult() {
    if(completion?.renderResult())return;
    const el=$('#result-area');
    if(state.phase==='paused')el.innerHTML=`<div class="flow-card"><h3>${icon('pause')}任务已暂停，进度已保留</h3><p>尚未执行的步骤会在继续后接上。已应用的修改可在历史中查看。</p><button class="btn btn-solid" data-action="resume">继续任务</button></div>`;

    else if(state.phase==='rolledback')el.innerHTML='<div class="flow-card"><h3>已撤销本次门限修改</h3><p>恢复到本次操作前的值，原检查结果已过期。可以输入新的门限需求。</p></div>';
    else el.innerHTML='';
  }
  function nodeCard(id,x,y,type,title,content) {
    const pending=(id==='chip'||id==='scanner')?state.stage<2:(id==='minor'||id==='major')?state.stage<3:false;
    const active=state.phase==='running'&&def(state.activeTask)?.target===id;
    return `<button class="card-demo object-node ${id==='sensor'?'node-sensor':''} ${state.target===id?'is-selected':''} ${active?'is-active':''} ${pending?'is-pending':''}" style="left:${x}px;top:${y}px" data-action="select-node" data-target="${id}" data-x="${x}" data-y="${y}" aria-label="选择 ${title}" ${pending?'disabled':''}><span class="node-type"><span>${type}</span>${icon(id==='chip'?'chip':id==='sensor'?'locate':id==='scanner'?'search':'alert')}</span><strong class="node-title">${title}</strong><div class="node-id">${names[id]}</div>${content}</button>`;
  }
  function renderGraph() {
    const p=hasProposal()?state.proposal.after:state.phase==='decision'?{minor:state.requested,major:state.values.major}:null;
    const update=state.values.minor!==baseline.UpperNoncritical||state.values.major!==baseline.UpperCritical;
    const e1=state.stage>=2?'is-visible':'',e2=state.stage>=3?'is-visible':'',active=state.phase==='running'?'is-active':'';
    $('#diagram').innerHTML=`<svg class="connections" viewBox="0 0 1020 450" aria-hidden="true"><path class="graph-edge ${e1} ${state.activeTask==='locate'?active:''}" d="M149 205V240"/><path class="graph-edge ${e1} ${state.activeTask==='locate'?active:''}" d="M268 315H295Q315 315 315 295V255Q315 240 337 240"/><path class="graph-edge ${e2} ${['refs','rule','validate'].includes(state.activeTask)?active:''}" d="M663 200H695Q715 200 715 180V130Q715 115 740 115"/><path class="graph-edge ${e2} ${['refs','rule','validate'].includes(state.activeTask)?active:''}" d="M663 285H695Q715 285 715 300V320Q715 335 740 335"/><text class="edge-label" x="163" y="228">Chip 引用</text><text class="edge-label" x="285" y="352">Value / Status</text><text class="edge-label" x="687" y="20">告警门限引用</text></svg>`+
      nodeCard('chip',30,30,'硬件 · I2C 芯片','进风温度芯片',`<div class="node-meta"><span>I2c_8</span><span>地址值 144</span></div><div class="node-source">Anchor → I2c_8 → Lm75_InletTemp</div><div class="node-source">${state.stage>=2?'硬件 CSR · 已定位':'等待关联分析'}</div>`)+
      nodeCard('scanner',30,240,'采集 · Scanner','进风温度采集',`<div class="node-meta"><span>Period</span><span class="mono">1000 ms</span></div><div class="node-meta"><span>Chip</span><span>进风温度芯片</span></div><div class="node-source">提供 Value / Status</div>`)+
      nodeCard('sensor',337,120,'当前配置对象 · ThresholdSensor','进风温度',`<div class="thresholds"><div class="threshold"><span class="threshold-label">一般告警</span><span class="threshold-value">${state.values.minor}<em> °C</em></span>${p&&p.minor!==state.values.minor?`<span class="candidate">待应用 → ${p.minor}°C</span>`:''}</div><div class="threshold"><span class="threshold-label">严重告警</span><span class="threshold-value">${state.values.major}<em> °C</em></span>${p&&p.major!==state.values.major?`<span class="candidate">待应用 → ${p.major}°C</span>`:''}</div></div>${state.phase==='decision'?'<div class="candidate">候选门限级别冲突 · 尚未应用</div>':`<div class="${update?'applied-mark':'node-source'}">${update?`已更新至 R${state.revision} · 可撤销`:'硬件 + 软件 CSR · 原始配置'}</div>`}`)+
      nodeCard('minor',740,30,'告警 · 一般','进风过温一般告警',`<div class="node-meta"><span>Condition</span><span class="mono">${state.values.minor}°C</span></div><div class="node-source">引用 UpperNoncritical</div>${p&&p.minor!==state.values.minor?`<div class="candidate">方案生效后 → ${p.minor}°C</div>`:''}`)+
      nodeCard('major',740,250,'告警 · 严重','进风过温严重告警',`<div class="node-meta"><span>Condition</span><span class="mono">${state.values.major}°C</span></div><div class="node-source">引用 UpperCritical</div>${p&&p.major!==state.values.major?`<div class="candidate">方案生效后 → ${p.major}°C</div>`:''}`);
    renderInspector();fit();
  }
  function renderInspector() {
    const id=state.target,name=names[id];
    const info={sensor:`Reading = <=/Scanner_Lm75_Inlet.Value；一般/严重门限 ${state.values.minor}/${state.values.major}°C。`,chip:'挂载于 I2c_8；Address 原值为 144。本次不修改芯片地址或物理路径。',scanner:'Chip = #/Lm75_InletTemp；Period = 1000 ms。采集结果也被散热需求和其他温度逻辑引用。',minor:'Condition = <=/ThresholdSensor_InletTemp.UpperNoncritical。保留引用，不重复写入固定门限。',major:'Condition = <=/ThresholdSensor_InletTemp.UpperCritical。软件 @Default.Condition 仍为 48，回退行为待核对。'};
    $('#object-inspector').innerHTML=`<div class="inspector-copy"><h3>${esc(name)}</h3><p>${esc(info[id])}</p></div><div class="inspector-actions"><button class="btn btn-ghost btn-sm" data-action="source">${icon('file')}查看源字段</button></div>`;
  }
  function renderSource() {
    const hw={...data.objects.ThresholdSensor_InletTemp,UpperNoncritical:state.values.minor,UpperCritical:state.values.major};
    const snippet={Unit:data.unit,Objects:{ThresholdSensor_InletTemp:hw,Scanner_Lm75_Inlet:data.objects.Scanner_Lm75_Inlet,Event_InletTempUpperMinor:data.objects.Event_InletTempUpperMinor,Event_InletTempUpperMajor:data.objects.Event_InletTempUpperMajor}};
    // This view labels merged fields; exporting uses the exact hardware source text.
    $('#source-code').innerHTML=JSON.stringify(snippet,null,2).split('\n').map(line=>/"UpperNoncritical"|"UpperCritical"/.test(line)?`<span class="code-highlight">${esc(line)}</span>`:esc(line)).join('\n');
  }
  function renderChanges() {
    const changes=getChanges();
    let h=`<section><h3>${hasProposal()?'待应用方案':'当前工作副本'} · ${changes.length} 个字段差异</h3><div class="source-file"><span>14100513_920s.sr</span><span class="muted">Objects.ThresholdSensor_InletTemp</span></div>`;
    h+=changes.length?`<table class="change-table"><thead><tr><th>字段</th><th>原始值</th><th>${hasProposal()?'候选值':'当前值'}</th></tr></thead><tbody>${changes.map(c=>`<tr><td>${c.field}</td><td class="before">${c.before}°C</td><td class="after">${c.after}°C</td></tr>`).join('')}</tbody></table>`:'<p class="helper">当前与原始门限一致。配置方案将在确认后显示。</p>';
    h+='<p class="source-footnote">Event.Condition 保留引用；采集周期和物理拓扑不变。软件默认值 46/48 的回退行为需要在固件环境中确认。</p>';
    if(state.phase==='preview')h+='<div class="action-row"><button class="btn btn-solid" data-action="apply">应用到工作副本</button></div>';
    if(state.history.some(x=>!x.undone))h+='<div class="action-row"><button class="btn" data-action="undo">撤销最近一次修改</button></div>';
    h+='</section><section><h3>检查对象与覆盖范围</h3>';
    const stale=state.report&&state.report.revision!==state.revision;
    const rows=[['门限级别顺序',`${state.values.minor} < ${state.values.major}；本原型的局部规则`,state.report&&!stale?'通过':'未核对'],['引用目标对象','8 个相关对象中的 21 处引用；仅检查目标对象存在性',state.report&&!stale?'21 / 21':'未核对'],['变更范围','本次仅修改当前传感器门限，不重建拓扑与事件',state.report&&!stale?'已核对':'未核对'],['软件默认回退行为','@Default.Condition 仍为 46/48，当前未运行固件默认值计算','待确认'],['设备告警触发 / 恢复','未连接 BMC；没有执行设备读写或告警触发','未执行']];
    h+=rows.map(([title,detail,status])=>`<div class="check-row"><div>${title}<p>${detail}</p></div><span class="tag ${['通过','21 / 21','已核对'].includes(status)?'is-success':''}">${status}</span></div>`).join('');
    h+=`<p class="helper">检查版本：${state.report?`R${state.report.revision}${stale?' · 结果已过期':''}`:'尚未生成'} · 当前版本 R${state.revision}。局部通过不等于整板适配完成。</p></section><section><h3>范围明细 · 8 个对象</h3><div class="scope-list">${Object.keys(data.objects).map(esc).join('\n')}</div></section>`;
    $('#changes-content').innerHTML=h;
  }
  function renderChrome() {
    $('#context-revision').textContent=`R${state.revision} · ${state.revision?'工作副本':'原始配置'}`;
    $('#version-label').textContent=`R${state.revision}`;
    $('#history-count').textContent=state.history.length;
    const progress=$('#task-progress');progress.hidden=state.phase==='idle';
    const current=state.activeTask?def(state.activeTask):state.phase==='decision'?def('rule'):state.phase==='preview'?def('preview'):state.phase==='review'?def('validate'):null;
    progress.innerHTML=`<strong>${current?current.type:'本次任务'}</strong><span>${esc(phaseName())}</span>`;
    $('#change-count').textContent=getChanges().length;
    const status=$('#object-status'); status.textContent=phaseName();status.className='tag '+({decision:'is-warning',preview:'is-warning',review:'is-success',running:'is-info'})[state.phase];
    $('#pause').hidden=state.phase!=='running';$('#send').hidden=state.phase==='running';$('#request').disabled=state.phase==='running';
    $('#composer-state').textContent=state.phase==='running'?`${def(state.activeTask)?.title||'正在工作'} · 可随时暂停`:state.phase==='decision'?'需要你确认门限方案，再继续生成。':state.phase==='preview'?'方案已就绪，应用前可查看右侧差异。':state.phase==='review'?'局部核对完成，运行时验证待准备。':state.phase==='paused'?'任务已暂停；输入“继续”或点击继续任务。':'已绑定当前对象，可输入门限修改需求。';
    const downstreamState={validation_setup:'请选择离线演示，或记录设备验证计划后交付。',simulation_review:'离线演示已完成，可继续审阅并生成评审包。',delivery_review:'请确认差异与未验证项后生成评审包。',completed:'评审包已就绪，可下载或返回首页。'};
    if(downstreamState[state.phase])$('#composer-state').textContent=downstreamState[state.phase];
    $('#canvas-summary').textContent=state.stage>=3?'5 个核心对象已呈现 · 局部检查范围 8 个对象':state.stage>=2?'已定位采集链路 · 告警关联分析中':'1 个当前对象 · 关联关系待分析';
    $('#saved-label').textContent=state.revision?'演示副本 · 未下发设备':'工作副本已载入';
    const banner=$('#canvas-banner');
    const text=state.phase==='running'?`AI 正在${def(state.activeTask)?.title||'工作'} · 画布同步更新`:state.phase==='decision'?`候选一般门限 ${state.requested}°C ≥ 严重门限 ${state.values.major}°C · 待确认`:state.phase==='preview'?'待应用方案已生成 · 当前值保持不变':state.phase==='review'?'局部检查完成 · 固件及设备行为未验证':state.phase==='paused'?'任务已暂停 · 当前画布状态已保留':'当前对象与告警依赖 · 点击节点查看来源';
    banner.className='canvas-banner '+({running:'is-running',decision:'is-warning',review:'is-success'})[state.phase];banner.innerHTML=icon(state.phase==='running'?'ai':state.phase==='decision'?'alert':'locate',state.phase==='running'?'ai-icon':'')+`<span>${text}</span>`;
    for(const b of document.querySelectorAll('[data-view]')){const selected=b.dataset.view===state.view;b.classList.toggle('is-selected',selected);b.setAttribute('aria-pressed',String(selected));}
    for(const v of ['graph','source','changes','delivery'])$(`#${v}-view`).hidden=v!==state.view;
  }
  function render(scroll=false) {
    renderMessages();renderTasks();renderDecisions();renderResult();renderGraph();renderSource();renderChanges();completion?.renderView();renderChrome();persist();notifyHost();
    requestAnimationFrame(()=>{fit();if(scroll)$('#chat-scroll').scrollTop=$('#chat-scroll').scrollHeight;});
  }
  function stripJsonc(src) {
    let out='',i=0,inString=false,escape=false;
    while(i<src.length){const c=src[i],d=src[i+1];if(inString){out+=c;if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')inString=false;i++;}else if(c==='"'){inString=true;out+=c;i++;}else if(c==='/'&&d==='/'){while(i<src.length&&src[i]!=='\n')i++;}else if(c==='/'&&d==='*'){i+=2;while(i<src.length&&!(src[i]==='*'&&src[i+1]==='/'))i++;i+=2;}else{out+=c;i++;}}
    return out;
  }
  async function runTasks(ids) {
    const token=++generation;state.phase='running';state.resumeList=ids;
    clearInterval(elapsedTimer);elapsedTimer=setInterval(()=>{if(state.phase==='running'){state.elapsed++;const el=$('#elapsed-label');if(el)el.textContent=`已工作 ${state.elapsed}s`;persist();}},1000);
    for(let i=0;i<ids.length;i++){
      const id=ids[i];state.activeTask=id;state.tasks[id]='running';state.resumeList=ids.slice(i);render(true);
      await new Promise(resolve=>setTimeout(resolve,id==='refs'?1400:1100));
      if(token!==generation)return;
      if(id==='read'){
        try{JSON.parse(data.sourceText);}catch{state.recovery=true;}
        try{JSON.parse(stripJsonc(data.sourceText));}catch{state.tasks[id]='conflict';state.phase='paused';state.activeTask=null;clearInterval(elapsedTimer);render(true);showToast('源文件解析失败，已暂停。');return;}
        state.stage=1;
      }
      if(id==='locate')state.stage=2;
      if(id==='refs')state.stage=3;
      if(id==='rule'&&state.requested>=state.values.major){state.tasks[id]='conflict';state.phase='decision';state.activeTask=null;state.resumeList=[];clearInterval(elapsedTimer);render(true);return;}
      if(id==='rule'){state.proposal={before:{...state.values},after:{...state.values,minor:state.requested},revision:state.revision,applied:false};}
      if(id==='apply'){
        const p=state.proposal;
        if(!p||p.revision!==state.revision||p.before.minor!==state.values.minor||p.before.major!==state.values.major){state.tasks[id]='conflict';state.phase='paused';clearInterval(elapsedTimer);render(true);showToast('当前配置已变化，请重新生成预览。');return;}
        state.values={...p.after};state.revision++;p.applied=true;
        state.history.push({revision:state.revision,before:{...p.before},after:{...p.after},title:'进风温度门限调整',time:new Date().toLocaleTimeString('zh-CN',{hour12:false}),undone:false});
      }
      if(['simulate','handoff'].includes(id))completion.execute(id);
      if(id==='validate')state.report={revision:state.revision,ordered:state.values.minor<state.values.major,references:data.referencesInScopedObjects.filter(x=>x.objectExistsInPair).length,total:data.referencesInScopedObjects.length};
      state.tasks[id]='done';
    }
    clearInterval(elapsedTimer);state.activeTask=null;state.resumeList=[];
    if(ids.includes('rule')){runTasks(['preview']);return;}
    if(ids.includes('handoff'))state.phase='completed';
    else if(ids.includes('simulate'))state.phase='simulation_review';
    else if(ids.includes('validate')){state.phase='review';state.tasks.runtime='waiting';}
    else if(ids.includes('preview')||ids.includes('rule'))state.phase='preview';
    render(true);
  }
  function start(text=defaultRequest) {
    if(state.phase==='running')return;
    const m=text.match(/(-?\d+(?:\.\d+)?)\s*(?:°\s*C|℃|C)/i)||text.match(/(?:改成|改为|调到|改到)[^\d-]*(-?\d+(?:\.\d+)?)/);
    if(!m||!Number.isFinite(Number(m[1]))){showToast('请输入明确的一般告警门限，例如“改成 50°C”。');return;}
    state.messages.push(text);state.request=text;state.requested=Number(m[1]);state.proposal=null;state.tasks={};state.elapsed=0;state.runtimeRequested=false;state.offline=null;state.packageInfo=null;state.reviewAck=false;$('#request').value='';$('#request').placeholder='可以继续调整门限，或输入“继续”';
    runTasks(['read','locate','refs','rule']).then(()=>{if(state.phase==='preview'&&state.tasks.preview!=='done')runTasks(['preview']);});
  }
  function undo() {
    if(state.phase==='running'){showToast('先暂停当前任务，再撤销修改。');return;}
    const transaction=[...state.history].reverse().find(x=>!x.undone);
    if(!transaction){showToast('没有可撤销的配置修改。');return;}
    if(state.values.minor!==transaction.after.minor||state.values.major!==transaction.after.major){showToast('门限在本次操作之后已变化，需要重新确认撤销范围。');return;}
    state.values={...transaction.before};transaction.undone=true;state.offline=null;state.packageInfo=null;state.reviewAck=false;state.revision++;state.phase='rolledback';state.proposal=null;state.view='graph';render(true);showToast('本次门限修改已撤销，检查结果已过期。');
  }
  function resume() {if(!state.resumeList.length)return showToast('当前没有暂停中的执行步骤。');runTasks([...state.resumeList]);}
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-action],[data-view]');if(!button)return;
    if(button.dataset.view){state.view=button.dataset.view;render();return;}
    const action=button.dataset.action;
    if(action==='home'){if(embedded){window.parent.postMessage({type:'csr-home'},location.protocol==='file:'?'*':location.origin);}else location.href='../工作地图-CSR协作.html';return;}
    if(completion.handleAction(action))return;
    if(action==='start'){start($('#request').value.trim()||defaultRequest);return;}
    if(action==='pause'){generation++;clearInterval(elapsedTimer);if(state.activeTask)state.tasks[state.activeTask]='queued';state.phase='paused';render(true);return;}
    if(action==='resume'){resume();return;}
    if(action==='apply'){runTasks(['apply','validate']);return;}
    if(action==='undo'){undo();return;}
    if(action==='edit-choice'){state.phase='decision';state.proposal=null;render(true);return;}
    if(action==='locate'||action==='select-node'){state.target=button.dataset.target||'sensor';state.view='graph';render();return;}
    if(action==='source'){state.view='source';render();return;}
    if(action==='view-changes'){state.view='changes';render();return;}
    if(action==='zoom-in'){zoom=Math.min(zoom+.15,2);fit();return;}
    if(action==='zoom-out'){zoom=Math.max(zoom-.15,.55);fit();return;}
    if(action==='fit'){zoom=1;fit();return;}
    if(action==='reset'){generation++;clearInterval(elapsedTimer);state=fresh();zoom=1;$('#request').value=defaultRequest;render();return;}
    if(action==='export'){
      const url=URL.createObjectURL(new Blob([currentSource()],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`14100513_920s_demo_R${state.revision}.sr`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('已导出演示工作副本；没有修改源工程文件。');return;
    }
    if(action==='history'){
      $('#history-content').innerHTML=state.history.length?state.history.map(x=>`<div class="history-item"><strong>R${x.revision} · ${x.title} ${x.undone?'· 已撤销':''}</strong><p>${x.before.minor}/${x.before.major} → ${x.after.minor}/${x.after.major}°C · ${esc(x.time)}</p><div class="helper">修改来源：用户确认；两个门限作为同一次操作。</div></div>`).join(''):'<p class="helper">尚无配置修改。确认方案并应用后，会在这里记录新旧值。</p>';$('#history-dialog').showModal();return;
    }
    if(action==='close-dialog')$('#history-dialog').close();
  });
  document.addEventListener('submit',event=>{
    event.preventDefault();
    if(completion.handleSubmit(event.target))return;
    if(event.target.id==='composer'){
      const text=$('#request').value.trim();if(!text)return;
      if(/^(继续|continue)$/i.test(text)&&state.phase==='paused'){state.messages.push(text);$('#request').value='';resume();return;}
      if(/^(继续|continue)$/i.test(text)&&['review','simulation_review','completed'].includes(state.phase)){$('#request').value='';completion.openValidation();return;}
      start(text);
    }
    if(event.target.id==='decision-form'){
      const choice=new FormData(event.target).get('choice');
      if(choice==='retain'){state.phase='retained';state.proposal=null;state.tasks.rule='done';render(true);return;}
      const major=Number($('#major-input').value);
      if(!Number.isFinite(major)||major<=state.requested){$('#decision-error').textContent=`严重告警门限需要大于一般告警 ${state.requested}°C，请调整后继续。`;return;}
      state.messages.push(`本次演示：一般 ${state.requested}°C、严重 ${major}°C，生成修改预览。`);
      state.proposal={before:{...state.values},after:{minor:state.requested,major},revision:state.revision,applied:false};state.tasks.rule='done';runTasks(['preview']);
    }
  });
  $('#request').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#composer').requestSubmit();}});
  new ResizeObserver(fit).observe($('#graph-viewport'));
  const narrow=matchMedia('(max-width: 760px)');
  function syncNarrow(){requestAnimationFrame(()=>{for(const gutter of document.querySelectorAll('#main-split > [role="separator"]'))gutter.hidden=narrow.matches;fit();});}
  narrow.addEventListener('change',syncNarrow);window.addEventListener('load',syncNarrow);
  if(state.messages.length){$('#request').value='';$('#request').placeholder='可以继续调整门限，或输入“继续”';}
  function notifyHost(){if(!embedded||parent===window)return;parent.postMessage({type:'csr-task-update',task:{entryId:state.entryId,request:state.request,phase:state.phase,revision:state.revision,values:state.values,stage:state.stage,activeTask:state.activeTask?def(state.activeTask)?.title:null,packageReady:state.packageInfo?.revision===state.revision,offlineComplete:state.offline?.revision===state.revision}},location.protocol==='file:'?'*':location.origin);}
  completion=window.CSRCompletion.create({$ ,esc,icon,getState:()=>state,render,runTasks,currentSource,data,showToast});
  render();
  if(autoStart){$('#request').value=entryRequest;setTimeout(()=>start(entryRequest),150);}
})();
