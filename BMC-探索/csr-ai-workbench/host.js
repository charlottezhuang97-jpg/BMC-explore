/* Bridge the existing Home shell and the reusable configuration workbench. */
(() => {
  window.CSRHost={create({root,getState,showView,persist}){
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const frame=root.querySelector('#wm-configuration-frame');
    const phaseLabels={idle:'准备开始',running:'执行中',decision:'待确认门限',preview:'等待应用',paused:'已暂停',review:'等待验证与交付',validation_setup:'选择验证方式',simulation_review:'离线演示已完成',delivery_review:'待审阅交付',completed:'评审包已就绪',rolledback:'已撤销修改',retained:'保留原配置'};
    function isConfigurationRequest(text){return /门限|阈值/.test(text)&&/一般|告警|温度|进风/.test(text);}
    function open(request,forceNew=false){
      const s=getState();
      if(forceNew||!s.csrTask){s.csrTask={entryId:`csr-${Date.now()}-${Math.random().toString(16).slice(2,8)}`,request:request||'把一般告警门限改成 50°C',phase:'idle',revision:0,values:{minor:46,major:48}};}
      s.homeDraft=s.csrTask.request;showView('configuration');persist();
    }
    function mount(){
      const s=getState();if(!s.csrTask){s.csrTask={entryId:`csr-${Date.now()}`,request:'把一般告警门限改成 50°C',phase:'idle',revision:0,values:{minor:46,major:48}};}
      if(frame.dataset.entry!==s.csrTask.entryId){
        const q=new URLSearchParams({embedded:'1',entry:s.csrTask.entryId,request:s.csrTask.request});
        frame.src='csr-ai-workbench/index.html?'+q.toString();frame.dataset.entry=s.csrTask.entryId;
      }
      renderHome();
    }
    function renderHome(){
      const s=getState(),task=s.csrTask,home=root.querySelector('[data-page="home"]');
      let card=home.querySelector('#wm-csr-current');const original=home.querySelector('.home-current:not(#wm-csr-current)');
      if(!task){if(card)card.hidden=true;if(original)original.hidden=false;return;}
      if(!card){card=document.createElement('section');card.className='home-current';card.id='wm-csr-current';card.setAttribute('aria-label','进风温度配置任务');home.querySelector('#wm-home-search').after(card);}
      card.hidden=false;if(original)original.hidden=true;
      const phases=['review','validation_setup','simulation_review','delivery_review','completed'];
      const completed=task.phase==='completed',current=task.stage<3?0:['decision','preview'].includes(task.phase)?1:phases.includes(task.phase)?3:2;
      const steps=[['读取并追踪 CSR','ExpBoard_1 · Inlet Temp · 硬件与软件文件'],['确认两级告警门限',`当前工作副本：${task.values?.minor??46}/${task.values?.major??48}°C`],['应用与局部核对','字段差异、引用目标及版本检查'],['验证与评审交付',completed?'评审包已生成；真实设备验证仍待执行':task.offlineComplete?'离线演示已完成，继续审阅交付':'离线演示 / 设备计划 → 交付审阅 → 评审包']];
      card.innerHTML=`<div class="home-current-top"><span class="eyebrow">当前任务 <span class="home-slash">/</span> CSR 配置</span><span class="tag" data-tone="${completed?'green':task.phase==='running'?'blue':'amber'}">${phaseLabels[task.phase]||'进行中'}</span></div><h3>进风温度 · 告警门限调整</h3><p>${esc(task.request)}</p><ol class="home-steps">${steps.map(([title,sub],i)=>`<li class="${completed||i<current?'is-done':i===current?'is-current':'is-future'}"><span class="step-mark">${completed||i<current?'✓':i+1}</span><div><strong>${title}</strong><small>${esc(sub)}</small></div>${!completed&&i===current?'<span class="step-current-label">当前步骤</span>':''}</li>`).join('')}</ol><div class="home-current-bottom"><span>工作副本 R${task.revision||0} · ${task.packageReady?'配置评审交付已完成':'进度已保留，可继续原任务'}</span><div class="actions"><button type="button" data-csr-resume class="home-primary cursor-interaction">${completed?'查看交付结果':'继续配置任务'} ↗</button><button type="button" data-open-task class="cursor-interaction">查看风扇板任务</button></div></div>`;
    }
    root.addEventListener('click',e=>{
      if(e.target.closest('[data-csr-resume]'))open();
      if(e.target.closest('[data-csr-example]')){root.querySelector('#wm-home-query').value='把一般告警门限改成 50°C';root.querySelector('#wm-home-query').focus();}
    });
    window.addEventListener('message',e=>{
      if(e.source!==frame.contentWindow)return;
      if(e.origin!==(location.protocol==='file:'?'null':location.origin))return;
      if(e.data?.type==='csr-home'){showView('home');renderHome();persist();return;}
      if(e.data?.type!=='csr-task-update')return;
      const task=e.data.task,s=getState();if(!task||task.entryId!==s.csrTask?.entryId||typeof task.request!=='string')return;
      const allowed=['idle','running','decision','preview','paused','review','validation_setup','simulation_review','delivery_review','completed','rolledback','retained'];
      if(!allowed.includes(task.phase)||!Number.isFinite(task.revision)||!Number.isFinite(task.values?.minor)||!Number.isFinite(task.values?.major))return;
      s.csrTask={entryId:task.entryId,request:task.request,phase:task.phase,revision:task.revision,values:task.values,stage:task.stage,packageReady:Boolean(task.packageReady),offlineComplete:Boolean(task.offlineComplete)};renderHome();persist();
    });
    return {isConfigurationRequest,open,mount,renderHome};
  }};
})();
