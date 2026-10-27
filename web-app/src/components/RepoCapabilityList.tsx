import React from 'react';
import { detectRepo, REPO_CAPABILITIES, type Capability } from '../data/repoCapabilities';

/* ═══════════════════════════════════════════════════════════════════════
   仓能力清单（共享渲染）—— 仓身份 + 分组功能。
   同一份内容喂给 rail 弹窗与资源管理器停靠区（交互/样式一致）。
   风格：紧凑、少彩色 —— 中性灰白文字/图标，靠填充分层，不铺紫色。
   ═══════════════════════════════════════════════════════════════════════ */

interface Props {
  dock?: boolean;
  onOpenView: (viewId: string) => void;
  onRunAgent: (cmd: string) => void;
}

function Pill({ cap, onOpenView, onRunAgent, dock }: { cap: Capability } & Props) {
  return (
    <button
      onClick={() => { if (cap.run) onRunAgent(cap.run); else if (cap.open) onOpenView(cap.open); }}
      title={cap.run ? '派发到 agent 终端' : '打开功能视图'}
      style={{
        padding: dock ? '8px 14px' : '5px 11px', minHeight: dock ? 36 : undefined, borderRadius: 100, border: 'none',
        background: 'rgba(255,255,255,0.06)', cursor: 'pointer', fontFamily: 'inherit',
        fontSize: dock ? 13 : 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.82)', transition: 'background .15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; }}
    >
      {cap.name}
    </button>
  );
}

export function RepoCapabilityList({ onOpenView, onRunAgent, dock = false }: Props) {
  const repo = detectRepo();
  const groups = REPO_CAPABILITIES[repo.type] ?? [];

  return (
    <div>
      {/* 仓身份 */}
      {!dock && <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, background: 'rgba(255,255,255,0.06)', display: 'grid', placeItems: 'center' }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="rgba(255,255,255,0.72)" strokeWidth="1.8" strokeLinejoin="round">
            <path d="M10 5H4a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-8l-2-2z" />
          </svg>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repo.name}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.42)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repo.title}</div>
        </div>
      </div>}

      {/* 功能清单 */}
      {groups.map(g => (
        <section key={g.group} style={{ marginBottom: dock ? 20 : 9 }}>
          <div style={{ fontSize: dock ? 12 : 10.5, fontWeight: 600, color: dock ? 'var(--foreground-secondary)' : 'rgba(255,255,255,0.35)', marginBottom: dock ? 10 : 6 }}>{g.group}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: dock ? 8 : 6 }}>
            {g.items.map(cap => <Pill key={cap.name} cap={cap} dock={dock} onOpenView={onOpenView} onRunAgent={onRunAgent} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
