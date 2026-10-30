/* Review handoff and local simulation. No network or device operations. */
(() => {
  const encoder = new TextEncoder();
  function zip(entries) {
    const chunks=[], directory=[]; let offset=0, directorySize=0;
    const u16=(v,o,n)=>v.setUint16(o,n,true),u32=(v,o,n)=>v.setUint32(o,n,true);
    const crc32=bytes=>{let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
    for(const [name,text] of Object.entries(entries)){
      const filename=encoder.encode(name), content=encoder.encode(text), crc=crc32(content);
      const header=new Uint8Array(30+filename.length),h=new DataView(header.buffer);
      u32(h,0,0x04034b50);u16(h,4,20);u16(h,6,0x0800);u32(h,14,crc);u32(h,18,content.length);u32(h,22,content.length);u16(h,26,filename.length);header.set(filename,30);
      const central=new Uint8Array(46+filename.length),c=new DataView(central.buffer);
      u32(c,0,0x02014b50);u16(c,4,20);u16(c,6,20);u16(c,8,0x0800);u32(c,16,crc);u32(c,20,content.length);u32(c,24,content.length);u16(c,28,filename.length);u32(c,42,offset);central.set(filename,46);
      chunks.push(header,content);directory.push(central);offset+=header.length+content.length;directorySize+=central.length;
    }
    const end=new Uint8Array(22),e=new DataView(end.buffer);u32(e,0,0x06054b50);u16(e,8,directory.length);u16(e,10,directory.length);u32(e,12,directorySize);u32(e,16,offset);
    return new Blob([...chunks,...directory,end],{type:'application/zip'});
  }
  window.CSRCompletion={zip,create(api){
    const {$,esc,icon,getState,render,runTasks,currentSource,data,showToast}=api;
    const phases={validation_setup:'选择验证方式',simulation_review:'离线演示完成',delivery_review:'交付审阅',completed:'评审包已就绪'};
    const state=()=>getState();
    function openValidation(){state().phase='validation_setup';state().view='delivery';render(true);}
    function renderResult(){
      const s=state(),el=$('#result-area');
      if(s.phase==='review'){
        el.innerHTML=`<div class="flow-card is-success"><h3>${icon('check')}局部核对完成，继续完成交付</h3><p>当前 ${s.values.minor}/${s.values.major}°C 门限已应用。下一步可做离线告警演示，或保存设备验证计划。</p><div class="action-row"><button class="btn btn-solid" data-action="continue-runtime">继续验证与交付</button><button class="btn" data-action="review-delivery">先审阅交付</button><button class="btn btn-ghost" data-action="undo">撤销修改</button></div></div>`;return true;
      }
      if(s.phase==='validation_setup'){
        el.innerHTML=`<form id="runtime-setup" class="flow-card"><h3>${icon('play')}选择下一步验证方式</h3><label class="option"><input type="radio" name="mode" value="offline" checked><span><strong>离线告警演示</strong><small>用当前门限生成 5 组温度输入，观察触发与恢复；无需 BMC。</small></span></label><label class="option"><input type="radio" name="mode" value="device"><span><strong>准备设备验证计划</strong><small>记录环境与正式规格，设备验证保持待执行。</small></span></label><label class="form-field" for="bmc-name">计划验证环境（设备计划必填）<input id="bmc-name" name="environment" placeholder="例如：实验室 BMC-A" value="${esc(s.runtimePlan?.environment||'')}"></label><label class="form-field" for="spec-source">正式门限依据（设备计划必填）<input id="spec-source" name="specification" placeholder="规格文档名称 / 版本；未确认可选择离线演示" value="${esc(s.runtimePlan?.specification||'')}"></label><div class="helper">原型不会连接或写入设备。离线演示采用示例触发/回差规则，不代表固件实测。</div><div id="runtime-error" class="error-text" role="alert"></div><div class="action-row"><button class="btn btn-solid" type="submit">确认并继续</button><button class="btn btn-ghost" type="button" data-action="review-delivery">记录未验证项，继续交付</button></div></form>`;return true;
      }
      if(s.phase==='simulation_review'){
        el.innerHTML=`<div class="flow-card is-success"><h3>${icon('check')}离线演示完成 · 5 组输入</h3><p>已根据当前 ${s.values.minor}/${s.values.major}°C 门限演示告警触发与恢复。右侧可逐行查看结果。</p><div class="helper">只验证本原型的规则计算，设备与固件验证仍未执行。</div><div class="action-row"><button class="btn btn-solid" data-action="review-delivery">审阅并生成评审包</button><button class="btn" data-action="continue-runtime">调整验证方式</button></div></div>`;return true;
      }
      if(s.phase==='delivery_review'){
        el.innerHTML=`<div class="flow-card"><h3>${icon('file')}审阅配置与交付范围</h3><p>右侧列出了字段差异、验证记录与未验证项。确认后生成可下载的 CSR 评审包。</p><div class="helper">${s.runtimePlan?'已保留设备验证计划。':'设备验证尚未执行，将在交付说明中明确记录。'}</div><div class="action-row"><button class="btn btn-solid" data-action="generate-package">生成评审包</button><button class="btn" data-action="continue-runtime">返回验证准备</button></div><div id="package-error" class="error-text" role="alert"></div></div>`;return true;
      }
      if(s.phase==='completed'){
        el.innerHTML=`<div class="flow-card is-success"><h3>${icon('check')}本次配置交付已完成</h3><p>R${s.revision} 评审包已就绪，包含软硬件 CSR、变更记录、局部检查、验证计划及说明。</p><div class="helper">${s.offline?.revision===s.revision?'离线演示已完成；':'离线演示未执行；'}真实设备验证待执行。评审包不代表固件已部署。</div><div class="action-row"><button class="btn btn-solid" data-action="download-package">${icon('download')}下载评审包</button><button class="btn" data-action="home">返回首页</button><button class="btn btn-ghost" data-action="continue-runtime">继续补充验证</button></div></div>`;return true;
      }
      return false;
    }
    function renderView(){
      const s=state(),offline=s.offline?.revision===s.revision?s.offline:null;
      const changes=[['UpperNoncritical',data.objects.ThresholdSensor_InletTemp.UpperNoncritical,s.values.minor],['UpperCritical',data.objects.ThresholdSensor_InletTemp.UpperCritical,s.values.major]].filter(x=>x[1]!==x[2]);
      let h=`<section><span class="eyebrow">VALIDATION & HANDOFF</span><h3>进风温度 · 验证与交付</h3><p class="helper">当前工作副本 R${s.revision} · 一般 ${s.values.minor}°C / 严重 ${s.values.major}°C</p><div class="delivery-stages"><span class="tag is-success">配置修改</span><span class="tag ${s.report?.revision===s.revision?'is-success':''}">局部核对</span><span class="tag ${offline?'is-success':''}">离线演示${offline?'已完成':'可选'}</span><span class="tag ${s.packageInfo?.revision===s.revision?'is-success':''}">评审交付</span></div></section>`;
      if(offline){h+=`<section><h3>离线温度序列 · ${offline.rows.length} 组输入</h3><p class="helper">示例规则：读数 ≥ 门限时触发；读数 ≤ 门限 − 2°C 时恢复；告警状态跨行保留。此处不是设备采集值。</p><table class="change-table"><thead><tr><th>步骤</th><th>输入温度</th><th>一般告警</th><th>严重告警</th></tr></thead><tbody>${offline.rows.map((r,i)=>`<tr><td>${i+1} · ${esc(r.label)}</td><td>${r.temperature}°C</td><td>${r.minor?'触发中':'未触发'}</td><td>${r.major?'触发中':'未触发'}</td></tr>`).join('')}</tbody></table></section>`;}
      else h+='<section class="flow-card"><h3>下一步验证</h3><p>可使用当前配置做离线演示，或保留设备验证计划后直接生成评审交付。</p><button class="btn" data-action="continue-runtime">选择验证方式</button></section>';
      h+=`<section><h3>当前字段差异</h3><table class="change-table"><thead><tr><th>字段</th><th>原值</th><th>工作副本</th></tr></thead><tbody>${changes.map(([field,before,after])=>`<tr><td>${field}</td><td>${before}°C</td><td class="after">${after}°C</td></tr>`).join('')||'<tr><td colspan="3">与原始门限一致</td></tr>'}</tbody></table></section><section><h3>验证边界与剩余工作</h3><div class="check-row"><div>局部配置检查<p>来源解析、门限顺序、引用目标与字段变更范围</p></div><span class="tag ${s.report?.revision===s.revision?'is-success':''}">${s.report?.revision===s.revision?'当前版本已核对':'尚未核对 / 已过期'}</span></div><div class="check-row"><div>固件默认回退行为<p>软件 @Default.Condition 仍为 46/48，需在正式环境确认</p></div><span class="tag is-warning">待确认</span></div><div class="check-row"><div>设备告警触发 / 恢复<p>${s.runtimePlan?`计划环境：${esc(s.runtimePlan.environment)}；规格依据：${esc(s.runtimePlan.specification)}`:'未指定正式设备验证环境和门限规格'}</p></div><span class="tag">未执行</span></div></section>`;
      h+=`<section><h3>评审包内容</h3><div class="scope-list">14100513_920s.sr\n14100513_920s_soft.sr\nchange-summary.json\nlocal-check-report.json\noffline-simulation.json\nruntime-validation-plan.md\nREADME.md</div><p class="helper">源码、说明与报告打包为 ZIP；不包含构建、签名或部署结果。</p>`;
      if(s.phase==='delivery_review')h+=`<label class="option"><input id="review-ack" type="checkbox" ${s.reviewAck?'checked':''}><span>我已审阅字段差异，并知悉设备验证与默认回退行为尚未确认。</span></label><button class="btn btn-solid" data-action="generate-package">生成评审包</button>`;
      if(s.packageInfo?.revision===s.revision)h+=`<div class="action-row"><button class="btn btn-solid" data-action="download-package">下载 R${s.revision} 评审包</button></div>`;
      h+='</section>';$('#delivery-content').innerHTML=h;
    }
    function execute(id){
      const s=state();
      if(id==='simulate'){
        const minor=s.values.minor,major=s.values.major,inputs=[['低于门限',minor-3],['一般告警触发',(minor+major)/2],['严重告警触发',major+1],['严重告警恢复',major-2],['一般告警恢复',minor-2]];
        let a=false,b=false;const rows=inputs.map(([label,t])=>{a=t>=minor?true:t<=minor-2?false:a;b=t>=major?true:t<=major-2?false:b;return {label,temperature:Math.round(t*100)/100,minor:a,major:b};});
        s.offline={revision:s.revision,rule:'demo: >= threshold asserts; <= threshold - 2 clears',deviceConnected:false,rows};
      }
      if(id==='handoff')s.packageInfo={revision:s.revision,createdAt:new Date().toISOString(),deviceValidated:false};
    }
    function openReview(){const s=state();if(!s.report||s.report.revision!==s.revision){showToast('请先应用配置并核对当前版本，再进入交付。');return;}s.phase='delivery_review';s.reviewAck=false;s.view='delivery';render(true);}
    function handleAction(action){
      if(action==='continue-runtime'){openValidation();return true;}
      if(action==='review-delivery'){openReview();return true;}
      if(action==='generate-package'){
        if(!state().reviewAck){const el=$('#package-error');if(el)el.textContent='请先在右侧勾选审阅确认，再生成评审包。';showToast('请先确认已审阅差异和未验证项。');return true;}
        if(state().report?.revision!==state().revision){showToast('检查结果已过期，请重新核对。');return true;}
        runTasks(['handoff']);return true;
      }
      if(action==='download-package'){download();return true;}
      return false;
    }
    function handleSubmit(form){
      if(form.id!=='runtime-setup')return false;
      const fields=new FormData(form),s=state();
      if(fields.get('mode')==='offline'){s.view='delivery';runTasks(['simulate']);}
      else {
        const environment=String(fields.get('environment')||'').trim(),specification=String(fields.get('specification')||'').trim();
        if(!environment||!specification){$('#runtime-error').textContent='请填写计划验证环境和正式门限依据；也可选择离线演示，或记录未验证项后交付。';return true;}
        s.runtimePlan={environment,specification,revision:s.revision,executed:false};s.tasks.runtime='waiting';openReview();
      }
      return true;
    }
    function download(){
      const s=state();if(!s.packageInfo||s.packageInfo.revision!==s.revision){showToast('当前版本的评审包尚未生成，请先审阅。');return;}
      const j=x=>JSON.stringify(x,null,2)+'\n';
      const runtimePlan=s.runtimePlan||{environment:'未指定',specification:'未确认',executed:false};
      const files={
        '14100513_920s.sr':currentSource(),
        '14100513_920s_soft.sr':data.softwareSourceText,
        'change-summary.json':j({revision:s.revision,request:s.request,values:s.values,history:s.history,sources:data.sources}),
        'local-check-report.json':j({...s.report,scope:'local configuration only',deviceValidated:false,firmwareFallbackValidated:false}),
        'offline-simulation.json':j(s.offline?.revision===s.revision?s.offline:{executed:false,reason:'未执行当前版本离线演示'}),
        'runtime-validation-plan.md':`# 设备验证计划\n\n- 工作副本：R${s.revision}\n- 环境：${runtimePlan.environment}\n- 正式门限依据：${runtimePlan.specification}\n- 状态：待执行；未连接或写入真实设备\n\n待办：确认正式规格；验证软件默认回退；在批准的测试环境验证温度采集、两级告警触发和恢复。\n`,
        'README.md':`# 进风温度 CSR 评审包\n\n本包来自本地交互原型，门限为 ${s.values.minor}/${s.values.major}°C，仅供评审演示。\n包含硬件 CSR 工作副本、原软件 CSR、修改记录、局部检查与可选的离线演示记录。\n尚未验证正式散热规格、固件默认回退与真实设备行为。未构建、签名或部署。\n`,
      };
      const blob=zip(files),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`InletTemp-CSR-review-R${s.revision}.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('评审包已导出，未验证项已随包保留。');
    }
    document.addEventListener('change',e=>{if(e.target.id==='review-ack')state().reviewAck=e.target.checked;});
    return {phases,renderResult,renderView,execute,handleAction,handleSubmit,openValidation,openReview};
  }};
})();
