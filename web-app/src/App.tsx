import React, { useState, useCallback, useRef, useEffect, Suspense } from 'react';
import { ProjectList } from './components/ProjectList';
import { AgentTerminal, type TermRunRequest } from './components/AgentTerminal';
import { RepoCapabilityList } from './components/RepoCapabilityList';
import { RepoHintPopover } from './components/RepoHintPopover';
import { withBase } from './base';
import { CsrTopoFrame } from './csrTopoBridge';
import { HARDWARE_PROJECTS } from './data/projects';
import type { CSRDocument } from './types';
import { CsrExportPanel } from './components/CsrExportPanel';
import type { SignProfile } from './signing-types';
import { DEMO_PROFILES } from './signing-types';

// ── Lazy-loaded views ──────────────────────────────────────────────────────
const lazy = <T extends React.ComponentType<never>>(
  load: () => Promise<{ [k: string]: T }>,
  name: string
) => React.lazy(() => load().then((m) => ({ default: m[name] as T })));

const TopologyView               = lazy(() => import('./components/TopologyView'),               'TopologyView');
const EventConfig                = lazy(() => import('./components/EventConfig'),                'EventConfig');
const EventDefManager            = lazy(() => import('./components/EventDefManager'),            'EventDefManager');
const SensorConfig               = lazy(() => import('./components/SensorConfig'),               'SensorConfig');
const Simulator                  = lazy(() => import('./components/Simulator'),                  'Simulator');
const TianChiBoardTopologyView   = lazy(() => import('./components/TianChiBoardTopologyView'),   'TianChiBoardTopologyView');
const SoftwareHardwareAssociationView = lazy(() => import('./components/SoftwareHardwareAssociationView'), 'SoftwareHardwareAssociationView');
const ServerAssociationView      = lazy(() => import('./components/ServerAssociationView'),      'ServerAssociationView');
const HardwareTopologyCanvas     = lazy(() => import('./components/HardwareTopologyCanvas'),     'HardwareTopologyCanvas');
const BmcEnvView                 = lazy(() => import('./components/BmcEnvView'),                 'BmcEnvView');
const AiAssistView               = lazy(() => import('./components/AiAssistView'),               'AiAssistView');
const ExplorerView               = lazy(() => import('./components/ExplorerView'),               'ExplorerView');
const SigningConfigPanel         = lazy(() => import('./components/SigningConfigPanel'),         'SigningConfigPanel');
const WhiteBrandPanel            = lazy(() => import('./components/WhiteBrandPanel'),            'WhiteBrandPanel');

/** VSCode webview API bridge */
let _vscodeApi: { postMessage(msg: unknown): void } | null = null;
function getVscode() {
  type VscodeWindow = { acquireVsCodeApi?: () => { postMessage(msg: unknown): void } };
  if (_vscodeApi === null && typeof (window as unknown as VscodeWindow).acquireVsCodeApi === 'function') {
    _vscodeApi = (window as unknown as VscodeWindow).acquireVsCodeApi!();
  }
  return _vscodeApi;
}

function parseModelInfo(model: string): { name: string; badge: string | null } {
  const clean = model.replace(/[（(][^）)]*[）)]/g, '').trim();
  const matches = [...clean.matchAll(/\d{4}/g)];
  if (matches.length > 0) {
    const last = matches[matches.length - 1];
    const badge = last[0];
    const name = clean.slice(0, last.index).trim().replace(/\s+/g, ' ');
    return { name: name || clean, badge };
  }
  return { name: clean, badge: null };
}

// ── View routing ──────────────────────────────────────────────────────────
type ViewId =
  | 'home' | 'projects' | 'installGuide' | 'aiInstall' | 'explorer' | 'bmcEnv' | 'aiAssist' | 'aiHistory'
  | 'topology' | 'boardTopology' | 'association' | 'event' | 'eventDefManager' | 'sensor' | 'simulator'
  | 'vueTopo' | 'hwTopology' | 'serverView' | 'threeD' | 'csrTopo' | 'signingConfig'
  | 'smcOffset' | 'exprCalc' | 'coolingConfig' | 'whiteBrand' | 'logReviewer'
  | 'jsonNorth' | 'srLang' | 'srPrev' | 'pipeExpr' | 'smcExt' | 'mibSup'
  | 'openubmcLogin' | 'gitcodeKeys';

const CSR_REQUIRED = new Set<ViewId>(['topology', 'boardTopology', 'association', 'event', 'eventDefManager', 'sensor', 'simulator']);

// ── Rail icon SVG helper ───────────────────────────────────────────────────
function SI({ d }: { d: string | string[] }) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg className="pto-ide-frame__rail-icon" viewBox="0 0 24 24">
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

function WI({ d }: { d: string | string[] }) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg className="pto-ide-frame__window-icon" viewBox="0 0 24 24">
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

const ICONS: Record<string, React.ReactNode> = {
  home:         <SI d={['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10']} />,
  explorer:     <SI d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
  installGuide: <SI d={['M4 19.5A2.5 2.5 0 0 1 6.5 17H20','M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z','M9 7h7M9 11h5']} />,
  aiInstall:    <SI d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" />,
  bmcEnv:       <SI d={['M4 4h16a2 2 0 0 1 2 2v4H2V6a2 2 0 0 1 2-2z','M2 10h20v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8z','M8 7v3M12 7v3M16 7v3']} />,
  aiAssist:     <SI d={['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z','M8 10h8M8 14h5']} />,
  aiHistory:    <SI d={['M12 8v4l3 3','M3.05 11a9 9 0 1 0 .5-3','M3 4v4h4']} />,
  topology:     <SI d={['M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z','M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z','M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z','M8.59 13.51l6.83 3.98','M15.41 6.51l-6.82 3.98']} />,
  boardTopology:<SI d="M4 5h16M4 12h16M4 19h16M9 5v14M15 5v14" />,
  association:  <SI d={['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71','M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71']} />,
  event:        <SI d="M13 2L3 14h9l-1 8 10-12h-9l1-8" />,
  eventDefManager: <SI d={['M9 2h6a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z','M9 6h6','M9 10h6','M9 14h4','M7 2h2v4H7z']} />,
  sensor:       <SI d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  simulator:    <SI d="M5 3l14 9-14 9V3z" />,
  hwTopology:   <SI d={['M9 3H5a2 2 0 0 0-2 2v4m6-6h6m-6 0v18m6-18h4a2 2 0 0 1 2 2v4M3 9h6M21 9h-6','M3 21h6m-6 0v-4m18 4h-6m6 0v-4M9 21v-4m0 0h6m0 0v4']} />,
  threeD:       <SI d={['M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z','M3.27 6.96L12 12.01l8.73-5.05','M12 22.08V12']} />,
  vueTopo:      <SI d={['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z','M11 9h4a2 2 0 0 0 2-2V3','M9 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4','M7 21v-4a2 2 0 0 1 2-2h4','M15 13a2 2 0 1 0 0 4 2 2 0 0 0 0-4']} />,
  csrTopo:      <SI d={['M4 4h4v4H4z', 'M16 4h4v4h-4z', 'M4 16h4v4H4z', 'M16 16h4v4h-4z', 'M8 6h8M6 8v8M8 18h8M18 8v8']} />,
  serverView:   <SI d={['M21 4H3a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z','M21 14H3a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2z']} />,
  smcOffset:    <SI d="M4 9h16M4 15h16M10 3v18M14 3v18" />,
  exprCalc:     <SI d={['M4 17l6-6-6-6','M12 19h8']} />,
  coolingConfig:<SI d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 10 16H2m15.73-8.27A2 2 0 1 1 19 12H2" />,
  jsonNorth:    <SI d={['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z','M14 2v6h6','M10 13l-2 2 2 2','M14 13l2 2-2 2']} />,
  srLang:       <SI d={['M8 9l3 3-3 3','M13 15h3']} />,
  srPrev:       <SI d={['M20 3H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1z','M12 17v4','M8 21h8']} />,
  pipeExpr:     <SI d={['M4 21v-7','M4 10V3','M12 21v-9','M12 8V3','M20 21v-5','M20 12V3','M1 14h6','M9 8h6','M17 16h6']} />,
  smcExt:       <SI d={['M6 6h12v12H6z','M9 6V3','M15 6V3','M9 18v3','M15 18v3','M6 9H3','M6 15H3','M18 9h3','M18 15h3']} />,
  mibSup:       <SI d={['M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2','M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0H9V5z','M9 12h6','M9 16h6']} />,
  openubmcLogin:<SI d={['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z','M2 12h20','M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z']} />,
  gitcodeKeys:     <SI d={['M15 7a4 4 0 1 0-3.9 5H14l1.5 1.5L17 12l1.5 1.5L21 11l-2-2h-4.1A4 4 0 0 0 15 7z','M11 11l-7 7v3h3l7-7']} />,
  signingConfig:     <SI d={['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z','M9 12l2 2 4-4']} />,
  whiteBrand:        <SI d={['M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z','M7 7h.01']} />,
  logReviewer:       <SI d={['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z','M14 2v6h6','M7 14l2.2-3.6 2.3 5.2 2-3h3.5']} />,
};

// ── Pane layout system ─────────────────────────────────────────────────────

type PaneId   = string;
type TabId    = string;
type DropZone = 'center' | 'left' | 'right' | 'top' | 'bottom';

interface TabEntry { tabId: TabId; viewId: ViewId; }
type LeafPane = { kind: 'leaf'; paneId: PaneId; tabs: TabEntry[]; activeTabId: TabId | null; };
type SplitPane = { kind: 'split'; paneId: PaneId; dir: 'h' | 'v'; ratio: number; a: PaneNode; b: PaneNode; };
type PaneNode  = LeafPane | SplitPane;
interface DragState { tabId: TabId; fromPaneId: PaneId; viewId: ViewId; }

function uid(): string { return Math.random().toString(36).slice(2, 9); }

function mkLeaf(paneId: PaneId = uid(), tabs: TabEntry[] = [], activeTabId: TabId | null = null): LeafPane {
  return { kind: 'leaf', paneId, tabs, activeTabId };
}

function allLeaves(n: PaneNode): LeafPane[] {
  return n.kind === 'leaf' ? [n] : [...allLeaves(n.a), ...allLeaves(n.b)];
}

/** Map over all leaf nodes; auto-collapses empty leaves inside splits */
function mapLeaves(n: PaneNode, fn: (l: LeafPane) => PaneNode): PaneNode {
  if (n.kind === 'leaf') return fn(n);
  const a = mapLeaves(n.a, fn);
  const b = mapLeaves(n.b, fn);
  if (a.kind === 'leaf' && !a.tabs.length) return b;
  if (b.kind === 'leaf' && !b.tabs.length) return a;
  return { ...n, a, b };
}

function lAddTab(n: PaneNode, paneId: PaneId, tab: TabEntry): PaneNode {
  return mapLeaves(n, l =>
    l.paneId !== paneId ? l : { ...l, tabs: [...l.tabs, tab], activeTabId: tab.tabId }
  );
}

function lActivateTab(n: PaneNode, paneId: PaneId, tabId: TabId): PaneNode {
  return mapLeaves(n, l =>
    l.paneId !== paneId ? l : { ...l, activeTabId: tabId }
  );
}

function lCloseTab(n: PaneNode, paneId: PaneId, tabId: TabId): PaneNode {
  return mapLeaves(n, l => {
    if (l.paneId !== paneId) return l;
    const tabs = l.tabs.filter(t => t.tabId !== tabId);
    const activeTabId = l.activeTabId === tabId ? (tabs.at(-1)?.tabId ?? null) : l.activeTabId;
    return { ...l, tabs, activeTabId };
  });
}

function lRemoveTab(n: PaneNode, tabId: TabId): PaneNode {
  return mapLeaves(n, l => {
    if (!l.tabs.some(t => t.tabId === tabId)) return l;
    const tabs = l.tabs.filter(t => t.tabId !== tabId);
    const activeTabId = l.activeTabId === tabId ? (tabs.at(-1)?.tabId ?? null) : l.activeTabId;
    return { ...l, tabs, activeTabId };
  });
}

function lSplit(n: PaneNode, paneId: PaneId, dir: 'h' | 'v', side: 'a' | 'b', tab: TabEntry): { n: PaneNode; newId: PaneId } {
  let newId = '';
  function go(node: PaneNode): PaneNode {
    if (node.kind === 'split') return { ...node, a: go(node.a), b: go(node.b) };
    if (node.paneId !== paneId) return node;
    const newLeaf = mkLeaf(uid(), [tab], tab.tabId);
    newId = newLeaf.paneId;
    return { kind: 'split', paneId: uid(), dir, ratio: 0.5,
      a: side === 'a' ? newLeaf : node,
      b: side === 'b' ? newLeaf : node } as SplitPane;
  }
  return { n: go(n), newId };
}

function lSetRatio(n: PaneNode, paneId: PaneId, r: number): PaneNode {
  if (n.kind === 'leaf') return n;
  if (n.paneId === paneId) return { ...n, ratio: Math.max(0.1, Math.min(0.9, r)) };
  return { ...n, a: lSetRatio(n.a, paneId, r), b: lSetRatio(n.b, paneId, r) };
}

// ── View labels for tab bar ────────────────────────────────────────────────

const VIEW_LABELS: Partial<Record<ViewId, string>> = {
  home: '欢迎页', projects: '项目列表', installGuide: '安装引导', aiInstall: 'AI 引导安装', explorer: '资源管理器', jsonNorth: 'JSON 北向接口',
  srLang: 'SR 语言服务器', srPrev: 'SR 文件预览', pipeExpr: '管道表达式',
  smcExt: 'SMC 偏移量', exprCalc: '批量表达式', coolingConfig: '能效调速配置',
  mibSup: 'MIB 支持', bmcEnv: 'BMC 环境管理', hwTopology: '硬件拓扑',
  threeD: '3D 仿真', vueTopo: '硬件适配', signingConfig: '签名与证书管理',csrTopo: 'CSR 拓扑编辑器', serverView: '服务器视图',
  topology: '拓扑视图', association: '软硬件关联', simulator: '仿真调试',
  sensor: '传感器配置', event: '事件配置', eventDefManager: '事件管理', boardTopology: '板卡拓扑',
  aiAssist: 'AI 助手', aiHistory: 'AI 历史', smcOffset: 'SMC 偏移量',
  openubmcLogin: 'openUBMC 登录', gitcodeKeys: 'GitCode 密钥', logReviewer: '一键日志解析',
  whiteBrand: '白牌定制',
};

// ── Pane components ────────────────────────────────────────────────────────

interface PaneViewProps {
  activePaneId: PaneId;
  dragState: DragState | null;
  onActivatePane: (id: PaneId) => void;
  onActivateTab: (paneId: PaneId, tabId: TabId) => void;
  onCloseTab: (paneId: PaneId, tabId: TabId) => void;
  onDragStart: (ds: DragState) => void;
  onDragEnd: () => void;
  onDrop: (toPaneId: PaneId, zone: DropZone) => void;
  onSetRatio: (splitPaneId: PaneId, ratio: number) => void;
  onSplitPane: (paneId: PaneId, dir: 'h' | 'v') => void;
  renderContent: (viewId: ViewId) => React.ReactNode;
  /** 随激活 tab 变化的上下文动作（巡检/校验/出包），渲染在分屏按钮左侧 */
  renderTabActions: (viewId: ViewId) => React.ReactNode;
}

function PaneView({ node, ...props }: { node: PaneNode } & PaneViewProps) {
  return node.kind === 'leaf'
    ? <LeafPaneView leaf={node} {...props} />
    : <SplitView split={node} {...props} />;
}

function SplitView({ split, ...props }: { split: SplitPane } & PaneViewProps) {
  const [resizing, setResizing] = useState(false);
  const [liveRatio, setLiveRatio] = useState(split.ratio);
  const liveRatioRef = useRef(split.ratio);
  const containerRef = useRef<HTMLDivElement>(null);
  const onSetRatioRef = useRef(props.onSetRatio);
  onSetRatioRef.current = props.onSetRatio;

  const displayRatio = resizing ? liveRatio : split.ratio;

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    setResizing(true);
    const paneId = split.paneId;
    const onMove = (ev: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const r = split.dir === 'h'
        ? (ev.clientX - rect.left) / rect.width
        : (ev.clientY - rect.top) / rect.height;
      const clamped = Math.max(0.1, Math.min(0.9, r));
      liveRatioRef.current = clamped;
      setLiveRatio(clamped);
    };
    const onUp = () => {
      setResizing(false);
      onSetRatioRef.current(paneId, liveRatioRef.current);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = split.dir === 'h' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  const isH = split.dir === 'h';
  return (
    <div ref={containerRef}
      style={{ display: 'flex', flexDirection: isH ? 'row' : 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      <div style={{ [isH ? 'width' : 'height']: `${displayRatio * 100}%`, overflow: 'hidden', flexShrink: 0, minWidth: 0, minHeight: 0 }}>
        <PaneView node={split.a} {...props} />
      </div>
      <div
        className={`ide-split-handle ide-split-handle--${split.dir}${resizing ? ' is-resizing' : ''}`}
        onMouseDown={startResize}
      />
      <div style={{ flex: 1, overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
        <PaneView node={split.b} {...props} />
      </div>
      {/* 拖拽时铺一层覆盖层盖住 iframe，保证 mousemove 事件能到达父窗口（否则手柄不跟随鼠标）*/}
      {resizing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: isH ? 'col-resize' : 'row-resize' }} />
      )}
    </div>
  );
}

function LeafPaneView({ leaf, ...props }: { leaf: LeafPane } & PaneViewProps) {
  const [hoverZone, setHoverZone] = useState<DropZone | null>(null);
  const isDragging = props.dragState !== null;
  const isOwnDrag = isDragging && props.dragState!.fromPaneId === leaf.paneId;
  const activeTab = leaf.tabs.find(t => t.tabId === leaf.activeTabId);

  return (
    <div
      className={`ide-leaf-pane${leaf.paneId === props.activePaneId ? ' ide-leaf-pane--active' : ''}`}
      onMouseDown={() => props.onActivatePane(leaf.paneId)}
    >
      <div className="ide-tab-row">
        <div className="ide-tab-bar"
          onDragOver={e => { if (!isOwnDrag) { e.preventDefault(); } }}
          onDrop={e => { if (!isOwnDrag) { e.preventDefault(); props.onDrop(leaf.paneId, 'center'); } }}
        >
          {leaf.tabs.length === 0
            ? <span className="ide-tab-bar__hint">← 从侧边栏打开功能页</span>
            : leaf.tabs.map(tab => (
              <div
                key={tab.tabId}
                className={`ide-tab${tab.tabId === leaf.activeTabId ? ' ide-tab--active' : ''}${props.dragState?.tabId === tab.tabId ? ' is-dragging' : ''}`}
                draggable
                onDragStart={e => {
                  e.dataTransfer.effectAllowed = 'move';
                  props.onDragStart({ tabId: tab.tabId, fromPaneId: leaf.paneId, viewId: tab.viewId });
                }}
                onDragEnd={() => props.onDragEnd()}
                onClick={e => {
                  e.stopPropagation();
                  props.onActivateTab(leaf.paneId, tab.tabId);
                  props.onActivatePane(leaf.paneId);
                }}
              >
                <span className="ide-tab__icon">{ICONS[tab.viewId]}</span>
                <span className="ide-tab__label">{VIEW_LABELS[tab.viewId] ?? tab.viewId}</span>
                <button
                  className="ide-tab__close"
                  onClick={e => { e.stopPropagation(); props.onCloseTab(leaf.paneId, tab.tabId); }}
                >×</button>
              </div>
            ))
          }
        </div>
        {leaf.tabs.length > 0 && (
          <div className="ide-tab-bar__actions">
            {activeTab && props.renderTabActions(activeTab.viewId)}
            <button
              className="ide-split-btn"
              title="向右分屏"
              onClick={e => { e.stopPropagation(); props.onSplitPane(leaf.paneId, 'h'); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="9" height="18" rx="1.5"/>
                <rect x="13" y="3" width="9" height="18" rx="1.5"/>
              </svg>
            </button>
            <button
              className="ide-split-btn"
              title="向下分屏"
              onClick={e => { e.stopPropagation(); props.onSplitPane(leaf.paneId, 'v'); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="2" width="18" height="9" rx="1.5"/>
                <rect x="3" y="13" width="18" height="9" rx="1.5"/>
              </svg>
            </button>
          </div>
        )}
      </div>
      <div className="ide-leaf-content">
        <Suspense fallback={<ViewLoader />}>
          {activeTab
            ? props.renderContent(activeTab.viewId)
            : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--foreground-muted)', fontSize: 13 }}>
                从左侧活动栏选择功能页
              </div>
            )
          }
        </Suspense>
        {isDragging && !isOwnDrag && (
          <DropZones
            paneId={leaf.paneId}
            hoverZone={hoverZone}
            setHoverZone={setHoverZone}
            onDrop={(paneId, zone) => { props.onDrop(paneId, zone); setHoverZone(null); }}
          />
        )}
        {isDragging && isOwnDrag && leaf.tabs.length > 1 && (
          <DropZones
            paneId={leaf.paneId}
            hoverZone={hoverZone}
            setHoverZone={setHoverZone}
            onDrop={(paneId, zone) => { props.onDrop(paneId, zone); setHoverZone(null); }}
          />
        )}
      </div>
    </div>
  );
}

function DropZones({ paneId, hoverZone, setHoverZone, onDrop }: {
  paneId: PaneId;
  hoverZone: DropZone | null;
  setHoverZone: (z: DropZone | null) => void;
  onDrop: (paneId: PaneId, zone: DropZone) => void;
}) {
  const zones: { key: DropZone; label: string; cls: string }[] = [
    { key: 'center', label: '移入此区', cls: 'idz-c' },
    { key: 'left',   label: '← 向左分屏', cls: 'idz-l' },
    { key: 'right',  label: '向右分屏 →', cls: 'idz-r' },
    { key: 'top',    label: '↑ 向上分屏', cls: 'idz-t' },
    { key: 'bottom', label: '向下分屏 ↓', cls: 'idz-b' },
  ];
  return (
    <div className="ide-drop-overlay">
      {zones.map(z => (
        <div
          key={z.key}
          className={`ide-drop-zone ${z.cls}${hoverZone === z.key ? ' idz-hot' : ''}`}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); setHoverZone(z.key); }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHoverZone(null); }}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); onDrop(paneId, z.key); setHoverZone(null); }}
        >
          <span>{z.label}</span>
        </div>
      ))}
    </div>
  );
}

function ExtFeaturePlaceholder({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 14, padding: '0 48px',
    }}>
      <span style={{ fontSize: 36, lineHeight: 1 }}>{emoji}</span>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--foreground)' }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--foreground-secondary)', textAlign: 'center', maxWidth: 380, lineHeight: 1.7 }}>{desc}</div>
      <div style={{
        marginTop: 8, padding: '7px 14px', borderRadius: 6,
        background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
        fontSize: 11.5, color: 'var(--foreground-muted)',
      }}>
        由 BMC Studio CodeX 扩展提供 · 后续集成中
      </div>
    </div>
  );
}

function ViewLoader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', width: '100%',
      color: 'var(--foreground-muted)', fontSize: 13, gap: 8,
    }}>
      <span style={{
        display: 'inline-block', width: 16, height: 16,
        border: '2px solid currentColor', borderTopColor: 'transparent',
        borderRadius: '50%', animation: 'spin 0.7s linear infinite',
      }} />
      加载中…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function App() {
  const vscode = getVscode();
  const [csr, setCsr] = useState<CSRDocument | null>(null);
  const [eventDef, setEventDef] = useState<Record<string, unknown> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentProject, setCurrentProject] = useState<{ manufacturer: string; model: string } | null>(null);
  const [lightMode, setLightMode] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  // 默认宽度取屏宽 ~40%（约 1/3–1/2 屏），并按屏幕大小自适应夹取
  const [aiPanelWidth, setAiPanelWidth] = useState(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1440;
    return Math.min(Math.max(Math.round(w * 0.4), 420), 660);
  });
  const [termOpen, setTermOpen] = useState(false);
  const [termHeight, setTermHeight] = useState(240);
  const [termResizing, setTermResizing] = useState(false);
  const [termCmd, setTermCmd] = useState<TermRunRequest | null>(null);
  // 仓识别提示：左下角罗盘按钮弹窗（切仓即弹）
  const [repoHintOpen, setRepoHintOpen] = useState(false);
  const [commonFunctionsOpen, setCommonFunctionsOpen] = useState(false);
  const welcomeRef = useRef<HTMLIFrameElement>(null);
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('bmcRecentProjectIds') || 'null');
      if (Array.isArray(saved)) return saved.filter(id => typeof id === 'string');
    } catch { /* Use the existing sample projects on first visit. */ }
    return HARDWARE_PROJECTS.map(p => p.id);
  });
  // 弹窗贴内容区（工作区）左下角，尽量少遮挡内容
  const [repoAnchor, setRepoAnchor] = useState<{ left: number; bottom: number }>({ left: 48, bottom: 30 });
  const workareaRef = useRef<HTMLDivElement>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [moreMenuPos, setMoreMenuPos] = useState<{ top: number; left: number } | null>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const [csrExportOpen, setCsrExportOpen] = useState(false);
  const [signingProfiles, setSigningProfiles] = useState<SignProfile[]>(DEMO_PROFILES);

  // ── Pane layout state ──────────────────────────────────────────────────
  const initPaneId = useRef(uid());
  const [layout, setLayout] = useState<PaneNode>(() => {
    const homeTab: TabEntry = { tabId: uid(), viewId: 'home' };
    if (vscode) {
      const tab: TabEntry = { tabId: uid(), viewId: 'topology' };
      return mkLeaf(initPaneId.current, [tab], tab.tabId);
    }
    return mkLeaf(initPaneId.current, [homeTab], homeTab.tabId);
  });
  const [activePaneId, setActivePaneId] = useState<PaneId>(initPaneId.current);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const activePaneIdRef = useRef(activePaneId);
  activePaneIdRef.current = activePaneId;
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  const csrRef = useRef<typeof csr>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const eventDefInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { csrRef.current = csr; }, [csr]);

  // Sync activePaneId when the active pane is removed (e.g. tab collapse)
  useEffect(() => {
    const leaves = allLeaves(layout);
    if (leaves.length > 0 && !leaves.some(l => l.paneId === activePaneId)) {
      const newId = leaves[0].paneId;
      setActivePaneId(newId);
      activePaneIdRef.current = newId;
    }
  }, [layout, activePaneId]);

  useEffect(() => {
    if (lightMode) document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    return () => { document.documentElement.removeAttribute('data-theme'); };
  }, [lightMode]);

  const loadCsr = useCallback((content: string) => {
    try {
      const parsed = JSON.parse(content) as CSRDocument;
      if (parsed.ManagementTopology && parsed.Objects !== undefined) {
        setCsr(parsed);
        setDirty(false);
      } else {
        setCsr(null);
        alert('无效的 CSR 格式：需包含 ManagementTopology 和 Objects');
      }
    } catch (err) {
      setCsr(null);
      alert('JSON 解析失败：' + String(err));
    }
  }, []);

  useEffect(() => {
    if (!vscode) return;
    vscode.postMessage({ type: 'getInitialContent' });
    function handleMessage(event: MessageEvent) {
      const msg = event.data as { type: string; content?: string; uri?: string; eventDef?: Record<string, unknown> };
      if (msg.type === 'initialContent' && msg.content) {
        loadCsr(msg.content);
        if (msg.uri) setFileName(msg.uri.split('/').pop() || 'csr.sr');
      } else if (msg.type === 'eventDefLoaded' && msg.eventDef) {
        setEventDef(msg.eventDef);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [vscode, loadCsr]);

  // ── Core: open a view in the active pane (or focus if already open) ────
  const openView = useCallback((viewId: ViewId) => {
    setLayout(prev => {
      // If already open somewhere, activate that pane + tab
      for (const leaf of allLeaves(prev)) {
        const tab = leaf.tabs.find(t => t.viewId === viewId);
        if (tab) {
          setActivePaneId(leaf.paneId);
          activePaneIdRef.current = leaf.paneId;
          return lActivateTab(prev, leaf.paneId, tab.tabId);
        }
      }
      // Add to active pane (or first available leaf)
      const leaves = allLeaves(prev);
      const curPaneId = activePaneIdRef.current;
      const targetPaneId = leaves.some(l => l.paneId === curPaneId)
        ? curPaneId
        : (leaves[0]?.paneId ?? curPaneId);
      const newTab: TabEntry = { tabId: uid(), viewId };
      return lAddTab(prev, targetPaneId, newTab);
    });
  }, []);

  // Open a view "beside" the welcome pane. Split the layout at most ONCE
  // (welcome | work); every later scenario opens as a TAB in the work pane.
  // Re-splitting on each open would re-parent existing panes and remount their
  // iframes (visible flicker / "shake") — this avoids that.
  const openViewInSplit = useCallback((viewId: ViewId) => {
    setLayout(prev => {
      // Already open somewhere → just focus that pane + tab.
      for (const leaf of allLeaves(prev)) {
        const tab = leaf.tabs.find(t => t.viewId === viewId);
        if (tab) {
          setActivePaneId(leaf.paneId);
          activePaneIdRef.current = leaf.paneId;
          return lActivateTab(prev, leaf.paneId, tab.tabId);
        }
      }
      const leaves = allLeaves(prev);
      const newTab: TabEntry = { tabId: uid(), viewId };

      // Already split → add as a tab to a pane that ISN'T the welcome pane
      // (no new split, so no iframe remount elsewhere).
      if (leaves.length > 1) {
        const homePane = leaves.find(l => l.tabs.some(t => t.viewId === 'home'));
        const target = leaves.find(l => l !== homePane) ?? leaves[0];
        setActivePaneId(target.paneId);
        activePaneIdRef.current = target.paneId;
        return lAddTab(prev, target.paneId, newTab);
      }

      // Single pane → split once (welcome | view).
      const curPaneId = activePaneIdRef.current;
      const targetPaneId = leaves.some(l => l.paneId === curPaneId)
        ? curPaneId
        : leaves[0]?.paneId;
      if (!targetPaneId) return prev;
      const result = lSplit(prev, targetPaneId, 'h', 'b', newTab);
      if (!result.newId) return lAddTab(prev, targetPaneId, newTab);
      setActivePaneId(result.newId);
      activePaneIdRef.current = result.newId;
      return result.n;
    });
  }, []);

  // 在「向导所在 pane 之外」打开一个视图（如登录/密钥页），使向导保持可见——
  // 安装引导要求：外部页面在分屏内打开而非跳出浏览器。
  const openViewBesideWizard = useCallback((viewId: ViewId) => {
    const WIZARD_VIEWS = new Set<ViewId>(['aiInstall', 'installGuide']);
    setLayout(prev => {
      // 已打开 → 聚焦
      for (const leaf of allLeaves(prev)) {
        const tab = leaf.tabs.find(t => t.viewId === viewId);
        if (tab) {
          setActivePaneId(leaf.paneId);
          activePaneIdRef.current = leaf.paneId;
          return lActivateTab(prev, leaf.paneId, tab.tabId);
        }
      }
      const leaves = allLeaves(prev);
      const newTab: TabEntry = { tabId: uid(), viewId };
      // 优先放到不承载向导的 pane（保持向导可见）
      const beside = leaves.find(l => !l.tabs.some(t => WIZARD_VIEWS.has(t.viewId)));
      if (beside) {
        setActivePaneId(beside.paneId);
        activePaneIdRef.current = beside.paneId;
        return lAddTab(prev, beside.paneId, newTab);
      }
      // 只有向导 pane → 拆分一次（新页放左侧，向导留右侧）
      const wizardLeaf = leaves.find(l => l.tabs.some(t => WIZARD_VIEWS.has(t.viewId))) ?? leaves[0];
      if (!wizardLeaf) return prev;
      const result = lSplit(prev, wizardLeaf.paneId, 'h', 'a', newTab);
      if (!result.newId) return lAddTab(prev, wizardLeaf.paneId, newTab);
      setActivePaneId(result.newId);
      activePaneIdRef.current = result.newId;
      return result.n;
    });
  }, []);

  // CSR-required views need a document loaded; fall back to the default sample project
  const ensureCsrLoaded = useCallback(async (): Promise<boolean> => {
    if (csrRef.current) return true;
    const project = HARDWARE_PROJECTS.find(p => p.rootSrPath);
    if (!project?.rootSrPath) return false;
    try {
      const res = await fetch(withBase(project.rootSrPath));
      const text = await res.text();
      loadCsr(text);
      setFileName(`${project.manufacturer}_${project.model}.sr`);
      setCurrentProjectId(project.id);
      setCurrentProject({ manufacturer: project.manufacturer, model: project.model });
      return true;
    } catch {
      return false;
    }
  }, [loadCsr]);

  // 场景打开（分屏）— AI 助手 iframe 消息与 agent 终端共用同一入口，
  // CSR 依赖视图自动兜底加载默认样例工程
  const openScenario = useCallback((viewId: string) => {
    // AI 助手是唯一的专用 dock（区别于功能视图 tab）：AI 助手 / AI 引导安装
    // 都打开这个 dock，不再作为分屏 tab 打开，避免出现多个 AI 助手对话面板
    if (viewId === 'aiInstall') {
      try { localStorage.setItem('bmcStartInstallFlow', String(Date.now())); } catch { /* noop */ }
      setAiPanelOpen(true);
      return;
    }
    if (viewId === 'aiAssist') { setAiPanelOpen(true); return; }
    const id = viewId as ViewId;
    if (CSR_REQUIRED.has(id)) {
      void ensureCsrLoaded().then(ok => { if (ok) openViewInSplit(id); });
    } else {
      openViewInSplit(id);
    }
  }, [ensureCsrLoaded, openViewInSplit]);

  const handleNavTo = useCallback((viewId: ViewId) => {
    // AI 助手走专用 dock，不作为功能视图 tab 打开
    if (viewId === 'aiAssist') { setAiPanelOpen(true); return; }
    if (CSR_REQUIRED.has(viewId) && !csrRef.current) return;
    openView(viewId);
  }, [openView]);

  // 顶栏快捷动作 / iframe 请求 → 打开终端并派发 agent 命令
  const runQuickAction = useCallback((cmd: string) => {
    setTermOpen(true);
    setTermCmd({ id: Date.now(), cmd });
  }, []);

  // iframe 消息总线：
  //   ai-open-scenario — AI 助手打开历史会话关联的功能视图（分屏）
  //   ai-run-agent     — 页面（如安装引导失败横幅）请求派发 agent 任务到终端
  //   ai-open-history  — AI 面板「历史」按钮 → 在主区域开 aiHistory tab
  useEffect(() => {
    function onScenarioMsg(event: MessageEvent) {
      const msg = event.data as { type?: string; viewId?: string; cmd?: string };
      if (msg?.type === 'ai-open-scenario' && msg.viewId) {
        openScenario(msg.viewId);
      } else if (msg?.type === 'ai-open-web' && msg.viewId) {
        // 安装引导：外部页面（登录/GitCode 密钥）在向导旁的分屏内打开，不跳出浏览器
        openViewBesideWizard(msg.viewId as ViewId);
      } else if (msg?.type === 'ai-run-agent' && msg.cmd) {
        runQuickAction(msg.cmd);
      } else if (msg?.type === 'ai-open-history') {
        handleNavTo('aiHistory');
      } else if (msg?.type === 'ai-close-panel') {
        setAiPanelOpen(false);
      }
    }
    window.addEventListener('message', onScenarioMsg);
    return () => window.removeEventListener('message', onScenarioMsg);
  }, [openScenario, openViewBesideWizard, runQuickAction, handleNavTo]);

  // Ctrl+` 切换终端（VS Code 习惯）
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        setTermOpen(v => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 终端高度拖拽（macOS 风格手柄，同 AI 面板逻辑）
  const handleTermResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = termHeight;
    setTermResizing(true);
    const onMouseMove = (ev: MouseEvent) => {
      const dy = startY - ev.clientY;
      const max = Math.min(600, window.innerHeight * 0.7);
      setTermHeight(Math.max(140, Math.min(max, startHeight + dy)));
    };
    const onMouseUp = () => {
      setTermResizing(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [termHeight]);

  // 打开仓识别弹窗（锚点贴左下角罗盘按钮）
  const openRepoHint = useCallback(() => {
    const r = workareaRef.current?.getBoundingClientRect();
    if (r) setRepoAnchor({ left: r.left, bottom: window.innerHeight - r.bottom });
    setRepoHintOpen(true);
  }, []);

  // 切仓即弹：当前仓（currentProjectId）切到新的一个 → 从罗盘弹出识别卡
  const prevRepoRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentProjectId && currentProjectId !== prevRepoRef.current) {
      prevRepoRef.current = currentProjectId;
      openRepoHint();
    }
  }, [currentProjectId, openRepoHint]);

  const handleProjectSelect = useCallback(
    async (project: { id: string; manufacturer: string; model: string; rootSrPath?: string }) => {
      setCurrentProjectId(project.id);
      setCurrentProject({ manufacturer: project.manufacturer, model: project.model });
      if (project.rootSrPath) {
        try {
          const res = await fetch(withBase(project.rootSrPath));
          const text = await res.text();
          loadCsr(text);
          setFileName(`${project.manufacturer}_${project.model}.sr`);
          openViewInSplit('topology');
          setRecentProjectIds(prev => {
            const next = [project.id, ...prev.filter(id => id !== project.id)];
            try { localStorage.setItem('bmcRecentProjectIds', JSON.stringify(next)); } catch { /* Storage may be unavailable. */ }
            return next;
          });
        } catch (err) {
          alert('加载项目 CSR 失败：' + String(err));
        }
      } else {
        fileInputRef.current?.click();
      }
    },
    [loadCsr, openViewInSplit]
  );

  const syncWelcome = useCallback(() => {
    const recent = recentProjectIds.flatMap(id => {
      const p = HARDWARE_PROJECTS.find(project => project.id === id);
      return p ? [{ id: p.id, name: p.model, path: p.rootSrPath || p.id }] : [];
    });
    welcomeRef.current?.contentWindow?.postMessage({
      type: 'welcome-state', recent,
    }, window.location.origin);
  }, [recentProjectIds]);

  useEffect(() => { syncWelcome(); }, [syncWelcome]);
  useEffect(() => {
    function onWelcomeMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== welcomeRef.current?.contentWindow) return;
      const msg = event.data;
      if (msg?.type === 'welcome-ready') syncWelcome();
      if (msg?.type === 'welcome-projects') openViewInSplit('projects');
      if (msg?.type === 'welcome-select-project') {
        const project = HARDWARE_PROJECTS.find(p => p.id === msg.id);
        if (project) void handleProjectSelect(project);
      }
      if (msg?.type === 'welcome-import') fileInputRef.current?.click();
    }
    window.addEventListener('message', onWelcomeMessage);
    return () => window.removeEventListener('message', onWelcomeMessage);
  }, [syncWelcome, openViewInSplit, handleProjectSelect]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      loadCsr(reader.result as string);
      setFileName(file.name);
      setCurrentProjectId(null);
      setCurrentProject(null);
      openViewInSplit('topology');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleEventDefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { setEventDef(JSON.parse(reader.result as string)); }
      catch { alert('event_def.json 解析失败'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSave = useCallback(() => {
    if (!csr) return;
    const content = JSON.stringify(csr, null, 4);
    if (vscode) {
      vscode.postMessage({ type: 'saveContent', content });
      setDirty(false);
    } else {
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'csr_modified.sr';
      a.click();
      URL.revokeObjectURL(url);
      setDirty(false);
    }
  }, [csr, fileName, vscode]);

  const handleCsrChange = useCallback((next: CSRDocument) => {
    setCsr(next);
    setDirty(true);
  }, []);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = aiPanelWidth;
    const maxW = Math.min(880, Math.round(window.innerWidth * 0.6));
    // 覆盖层盖住 iframe，拖拽时 mousemove 才能到达父窗口（否则不跟手）
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;cursor:ew-resize';
    document.body.appendChild(overlay);
    const onMouseMove = (ev: MouseEvent) => {
      const dx = startX - ev.clientX;
      setAiPanelWidth(Math.max(360, Math.min(maxW, startWidth + dx)));
    };
    const onMouseUp = () => {
      overlay.remove();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [aiPanelWidth]);

  // ── Tab management callbacks ───────────────────────────────────────────
  const handleActivatePane = useCallback((id: PaneId) => {
    setActivePaneId(id);
    activePaneIdRef.current = id;
  }, []);

  const handleActivateTab = useCallback((paneId: PaneId, tabId: TabId) => {
    setActivePaneId(paneId);
    activePaneIdRef.current = paneId;
    setLayout(prev => lActivateTab(prev, paneId, tabId));
  }, []);

  const handleCloseTab = useCallback((paneId: PaneId, tabId: TabId) => {
    setLayout(prev => {
      const next = lCloseTab(prev, paneId, tabId);
      if (next.kind === 'leaf' && next.tabs.length === 0) {
        const homeTab: TabEntry = { tabId: uid(), viewId: 'home' };
        return { ...next, tabs: [homeTab], activeTabId: homeTab.tabId };
      }
      return next;
    });
  }, []);

  const handleDragStart = useCallback((ds: DragState) => {
    setDragState(ds);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragState(null);
  }, []);

  const handleDrop = useCallback((toPaneId: PaneId, zone: DropZone) => {
    const ds = dragStateRef.current;
    if (!ds) return;
    setDragState(null);

    const { tabId, fromPaneId, viewId } = ds;

    if (zone === 'center') {
      if (fromPaneId === toPaneId) return;
      setLayout(prev => {
        const withoutTab = lRemoveTab(prev, tabId);
        const leaves = allLeaves(withoutTab);
        const targetExists = leaves.some(l => l.paneId === toPaneId);
        const finalPaneId = targetExists ? toPaneId : (leaves[0]?.paneId ?? toPaneId);
        setActivePaneId(finalPaneId);
        activePaneIdRef.current = finalPaneId;
        return lAddTab(withoutTab, finalPaneId, { tabId, viewId });
      });
    } else {
      const dir: 'h' | 'v' = (zone === 'left' || zone === 'right') ? 'h' : 'v';
      const side: 'a' | 'b' = (zone === 'left' || zone === 'top') ? 'a' : 'b';
      setLayout(prev => {
        const withoutTab = lRemoveTab(prev, tabId);
        const result = lSplit(withoutTab, toPaneId, dir, side, { tabId, viewId });
        if (!result.newId) {
          // Target pane was removed; fall back to first leaf
          const firstLeaf = allLeaves(withoutTab)[0];
          if (!firstLeaf) return prev;
          setActivePaneId(firstLeaf.paneId);
          activePaneIdRef.current = firstLeaf.paneId;
          return lAddTab(withoutTab, firstLeaf.paneId, { tabId, viewId });
        }
        setActivePaneId(result.newId);
        activePaneIdRef.current = result.newId;
        return result.n;
      });
    }
  }, []);

  const handleSetRatio = useCallback((splitPaneId: PaneId, ratio: number) => {
    setLayout(prev => lSetRatio(prev, splitPaneId, ratio));
  }, []);

  const handleSplitPane = useCallback((paneId: PaneId, dir: 'h' | 'v') => {
    setLayout(prev => {
      const leaf = allLeaves(prev).find(l => l.paneId === paneId);
      if (!leaf) return prev;
      const activeTab = leaf.tabs.find(t => t.tabId === leaf.activeTabId);
      if (!activeTab) return prev;
      const newTab: TabEntry = { tabId: uid(), viewId: activeTab.viewId };
      const result = lSplit(prev, paneId, dir, 'b', newTab);
      if (!result.newId) return prev;
      setActivePaneId(result.newId);
      activePaneIdRef.current = result.newId;
      return result.n;
    });
  }, []);

  // VSCode: wait for extension to push content
  if (vscode && !csr) {
    return <div className="view-loading">正在加载 CSR 文件…</div>;
  }

  const vueSrc     = withBase('vue-topo/index.html');
  const csrTopoSrc = withBase('csr-topo-ext/index.html');
  const threeDSrc  = withBase('3d-viewer/index.html');
  const modelInfo = currentProject ? parseModelInfo(currentProject.model) : null;

  // ── Content renderer (called per-tab by LeafPaneView) ─────────────────
  function renderContent(viewId: ViewId): React.ReactNode {
    switch (viewId) {
      case 'home':
        return (
          <>
            <iframe ref={welcomeRef} onLoad={syncWelcome} src={withBase('welcome.html')} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} title="欢迎页" />
          </>
        );
      case 'projects':
        return <ProjectList projects={HARDWARE_PROJECTS} onSelect={handleProjectSelect} onUpload={() => fileInputRef.current?.click()} onOpenView={openScenario} projectsOnly />;
      case 'topology':
        return csr ? <TopologyView csr={csr} onChange={handleCsrChange} projectId={currentProjectId} eventDef={eventDef} /> : null;
      case 'boardTopology':
        return (currentProjectId === 'huawei-tianchi' && csr) ? <TianChiBoardTopologyView /> : null;
      case 'association':
        return csr ? <SoftwareHardwareAssociationView csr={csr} /> : null;
      case 'event':
        return csr ? <EventConfig csr={csr} eventDef={eventDef} onChange={handleCsrChange} /> : null;
      case 'eventDefManager':
        return <EventDefManager csr={csr} eventDef={eventDef} onChange={handleCsrChange} />;
      case 'sensor':
        return csr ? <SensorConfig csr={csr} onChange={handleCsrChange} /> : null;
      case 'simulator':
        return csr ? <Simulator csr={csr} /> : null;
      case 'explorer':
        return <ExplorerView onOpenView={openScenario} onRunAgent={runQuickAction} />;
      case 'installGuide':
        return <iframe src={withBase('install-entry.html')} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} title="安装部署引导" />;
      case 'aiInstall':
        // 安装引导已并入 AI 助手：以 flow=install 打开同一页面（新建安装引导对话）
        return <iframe src={withBase('ai-assist.html') + '?flow=install'} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} title="AI 引导安装" />;
      case 'openubmcLogin':
        return <iframe src="https://www.openubmc.cn/" style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} title="openUBMC 登录" />;
      case 'gitcodeKeys':
        return <iframe src="https://gitcode.com/-/user_settings/ssh_keys" style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} title="GitCode 密钥" />;
      case 'logReviewer':
        return <iframe src={withBase('log-reviewer.html')} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} title="一键日志解析" />;
      case 'bmcEnv':
        return <BmcEnvView />;
      case 'aiAssist':
        return <AiAssistView />;
      case 'aiHistory':
        return <iframe src={withBase('ai-assist.html') + '?view=history'} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} title="AI 历史" />;
      case 'vueTopo':
        return (
          <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
            {/* Canvas wrapper with top-right overlay buttons */}
            <div style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
              <iframe src={vueSrc} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} title="硬件适配" />
              <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6, zIndex: 10 }}>
                <button
                  className="ide-tab-action-btn"
                  title="agent 校验当前 CSR（csr_validate）"
                  onClick={() => runQuickAction('agent 校验当前 CSR')}
                >校验</button>
                <button
                  className={`ide-tab-action-btn${csrExportOpen ? ' ide-tab-action-btn--primary' : ''}`}
                  title="CSR 出包配置面板"
                  onClick={() => setCsrExportOpen(v => !v)}
                >{csrExportOpen ? '关闭出包' : 'CSR 出包'}</button>
              </div>
            </div>
            {csrExportOpen && (
              <CsrExportPanel
                onClose={() => setCsrExportOpen(false)}
                boardName={currentProject?.model ?? '当前板卡'}
                onExport={cfg => { console.log('[CSR出包]', cfg); }}
                onBinBuild={cfg => { console.log('[bin构建]', cfg); }}
                onAddProfile={() => openViewInSplit('signingConfig')}
              />
            )}
          </div>
        );
      case 'signingConfig':
        return (
          <SigningConfigPanel
            profiles={signingProfiles}
            onProfilesChange={setSigningProfiles}
          />
        );
      case 'whiteBrand':
        return <WhiteBrandPanel />;
      case 'csrTopo':
        // 默认加载示例工程并接入 public/sr-samples/ 板卡样例库：打开即进入
        // “已选择工程文件”的拓扑状态，下游板卡按 Bom/Type 从样例库解析。
        // 左树工具栏「调速配置」→ 跳转 IDE 的能效调速配置视图。
        return <CsrTopoFrame src={csrTopoSrc} onOpenCooling={() => handleNavTo('coolingConfig')} />;
      case 'hwTopology':
        return <HardwareTopologyCanvas />;
      case 'serverView':
        return <ServerAssociationView />;
      case 'threeD':
        return <iframe src={threeDSrc} style={{ width: '100%', height: '100%', border: 'none' }} title="3D仿真视图" />;
      case 'smcOffset':
        return <iframe src={`${vueSrc}?solo=true&tab=smc`} style={{ width: '100%', height: '100%', border: 'none' }} title="SMC偏移量计算器" />;
      case 'exprCalc':
        return <iframe src={`${vueSrc}?solo=true&tab=expr`} style={{ width: '100%', height: '100%', border: 'none' }} title="批量表达式计算器" />;
      case 'coolingConfig':
        return <iframe src={`${vueSrc}?solo=true&tab=cooling`} style={{ width: '100%', height: '100%', border: 'none' }} title="能效调速配置模板" />;
      case 'jsonNorth':
        return <ExtFeaturePlaceholder emoji="🔍" title="JSON 北向接口辅助" desc="为北向 API .json 文件提供定义跳转、悬停提示、自动补全、实时错误检测与语法高亮。在 VS Code 中打开对应 .json 文件即可使用。" />;
      case 'srLang':
        return <ExtFeaturePlaceholder emoji="⚡" title="SR 语言服务器" desc="基于 LSP 的 .sr 文件补全、诊断与悬停提示。读取 ~/.cache/openubmc/mdb_cache 中的 MDB 类定义，实时扫描更新。" />;
      case 'srPrev':
        return <ExtFeaturePlaceholder emoji="📄" title="SR 文件预览" desc="类似 Markdown 的 .sr 文件实时合并预览。点击编辑器标题栏「SR File: Show Merged Preview」按钮触发，自动检测并合并多个 .sr 源文件。" />;
      case 'pipeExpr':
        return <iframe src={`${vueSrc}?solo=true&tab=expr`} style={{ width: '100%', height: '100%', border: 'none' }} title="批量表达式计算器" />;
      case 'smcExt':
        return <iframe src={`${vueSrc}?solo=true&tab=smc`} style={{ width: '100%', height: '100%', border: 'none' }} title="SMC偏移量计算器" />;
      case 'mibSup':
        return <ExtFeaturePlaceholder emoji="📋" title="MIB 文件支持" desc="为 ASN.1 MIB 文件（.mib）提供语法高亮、自定义文件图标（深色/浅色主题）与对象重复配置校验。在 VS Code 中打开 .mib 文件即可使用。" />;
      default:
        return null;
    }
  }

  // ── Tab 行上下文动作（原顶栏全局按钮，按 IDE editor-title-actions 惯例下放） ──
  const CONTEXT_AGENT: Partial<Record<ViewId, { label: string; cmd: string; title: string }>> = {
    bmcEnv:   { label: '巡检', cmd: 'agent 巡检在线 BMC',  title: 'agent 巡检在线 BMC（bmc-remote MCP）' },
    topology: { label: '校验', cmd: 'agent 校验当前 CSR', title: 'agent 校验当前 CSR（csr_validate）' },
    vueTopo:  { label: '校验', cmd: 'agent 校验当前 CSR', title: 'agent 校验当前 CSR（csr_validate）' },
    event:    { label: '校验', cmd: 'agent 校验当前 CSR', title: 'agent 校验当前 CSR（csr_validate）' },
    eventDefManager: { label: '校验', cmd: 'agent 校验当前 CSR', title: 'agent 校验当前 CSR（csr_validate）' },
    sensor:   { label: '校验', cmd: 'agent 校验当前 CSR', title: 'agent 校验当前 CSR（csr_validate）' },
  };
  const CSR_SAVE_VIEWS = new Set<ViewId>(['topology', 'event', 'eventDefManager', 'sensor', 'association', 'boardTopology', 'simulator']);

  function renderTabActions(viewId: ViewId): React.ReactNode {
    const agentAct = CONTEXT_AGENT[viewId];
    const canSave = csr !== null && CSR_SAVE_VIEWS.has(viewId);
    const isTopo = viewId === 'vueTopo';
    // vueTopo buttons are rendered as canvas overlay — skip tab bar
    if (isTopo) return null;
    if (!agentAct && !canSave) return null;
    return (
      <>
        {agentAct && (
          <button
            className="ide-tab-action-btn"
            title={agentAct.title}
            onClick={e => { e.stopPropagation(); runQuickAction(agentAct.cmd); }}
          >{agentAct.label}</button>
        )}
        {isTopo && (
          <button
            className={`ide-tab-action-btn${csrExportOpen ? ' ide-tab-action-btn--primary' : ''}`}
            title="CSR 出包配置面板"
            onClick={e => { e.stopPropagation(); setCsrExportOpen(v => !v); }}
          >{csrExportOpen ? '关闭出包' : 'CSR 出包'}</button>
        )}
        {canSave && (
          <button
            className="ide-tab-action-btn ide-tab-action-btn--primary"
            disabled={!dirty}
            title={dirty ? (vscode ? '保存 CSR 文件' : '下载 CSR 文件') : '暂无修改'}
            onClick={e => { e.stopPropagation(); handleSave(); }}
          >{vscode ? '保存' : '出包'}</button>
        )}
      </>
    );
  }

  // ── Activity rail items ────────────────────────────────────────────────
  type RailItem = { id: ViewId; tooltip: string; csrRequired?: boolean; };

  const railItems: RailItem[] = [
    { id: 'home',         tooltip: '欢迎页' },
    { id: 'aiAssist',     tooltip: 'AI 助手' },
    { id: 'explorer',     tooltip: '资源管理器' },
    { id: 'installGuide', tooltip: '安装部署引导' },
    { id: 'pipeExpr',     tooltip: '管道表达式计算器' },
    { id: 'smcExt',       tooltip: 'SMC 偏移量计算器' },
    { id: 'coolingConfig',tooltip: '能效调速配置' },
    { id: 'bmcEnv',       tooltip: 'BMC 环境管理' },
    { id: 'logReviewer',  tooltip: '一键日志解析' },
    { id: 'vueTopo',       tooltip: '硬件适配' },
    { id: 'signingConfig', tooltip: '签名与证书管理' },
    { id: 'whiteBrand',    tooltip: '白牌定制' },
    { id: 'csrTopo',       tooltip: 'CSR 拓扑编辑器' },
    { id: 'eventDefManager', tooltip: '事件管理', csrRequired: true },
    { id: 'simulator',    tooltip: '仿真调试', csrRequired: true },
  ];

  // 未成熟功能收进「更多」菜单（Beta 预览）
  const moreItems: { id: ViewId; csrRequired?: boolean }[] = [
    { id: 'hwTopology' },
    { id: 'threeD' },
    { id: 'topology',    csrRequired: true },
    { id: 'association', csrRequired: true },
    { id: 'sensor',      csrRequired: true },
    { id: 'serverView' },
    ...(currentProjectId === 'huawei-tianchi' ? [{ id: 'boardTopology' as ViewId, csrRequired: true }] : []),
  ];

  // 代码辅助扩展（VS Code 扩展占位页，原顶栏星标下拉）
  const extItems: ViewId[] = ['jsonNorth', 'srLang', 'srPrev', 'mibSup'];

  // Rail button is highlighted if the view is the active tab in any pane
  const activeTabViewIds = new Set(
    allLeaves(layout)
      .map(l => l.tabs.find(t => t.tabId === l.activeTabId)?.viewId)
      .filter((id): id is ViewId => id !== undefined)
  );

  return (
    <div className="pto-ide-frame pto-ide-frame--page" data-ide-frame>
            <input ref={fileInputRef} type="file" accept=".sr,.json,application/json" onChange={handleFileUpload} style={{ display: 'none' }} />
            <input ref={eventDefInputRef} type="file" accept=".json" onChange={handleEventDefUpload} style={{ display: 'none' }} />
      {/* ── Topbar ── */}
      <div className="pto-ide-frame__topbar">
        <div className="pto-ide-frame__topbar-left">
          <div className="pto-ide-frame__workspace">
            <img className="ide-brand-logo" src={withBase('welcome/assets/icon.svg')} alt="openUBMC" />
            <span>openUBMC Studio</span>
          </div>
        </div>
        <div className="pto-ide-frame__topbar-center">
          {modelInfo && (
            <span className="topbar-subtitle">
              {modelInfo.name}{modelInfo.badge ? ` · ${modelInfo.badge}` : ''}
            </span>
          )}
        </div>
        <div className="pto-ide-frame__topbar-right">
          <div className="pto-ide-frame__window-actions">
            <button
              className={`pto-ide-frame__window-action${termOpen ? ' is-selected' : ''}`}
              onClick={() => setTermOpen(v => !v)}
              title="agent 终端（Ctrl+`）"
            >
              <WI d={['M4 17l6-6-6-6', 'M12 19h8']} />
            </button>
            <span className="pto-ide-frame__window-separator" />
            <button
              className="pto-ide-frame__window-action"
              onClick={() => setLightMode((v) => !v)}
              title="切换深浅色"
            >
              {lightMode
                ? <WI d={['M12 5a7 7 0 1 0 0 14A7 7 0 0 0 12 5z','M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42']} />
                : <WI d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              }
            </button>
            <span className="pto-ide-frame__window-separator" />
            <button
              className={`pto-ide-frame__window-action${aiPanelOpen ? ' is-selected' : ''}`}
              onClick={() => setAiPanelOpen((v) => !v)}
              title="AI 助手"
            >
              <WI d={['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z','M8 10h8M8 14h5']} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Body: activity rail + pane layout + AI panel ── */}
      <div className="pto-ide-frame__body">
        <nav className="pto-ide-frame__activity-rail ide-activity-rail">
          <div className="ide-rail-section">
            {railItems.map((item) => (
              <React.Fragment key={item.id}>
              <button
                className={`pto-ide-frame__rail-button ${activeTabViewIds.has(item.id) ? 'is-selected' : ''}`}
                onClick={() => {
                  if (item.csrRequired) {
                    void ensureCsrLoaded().then(ok => { if (ok) openView(item.id); });
                  } else {
                    handleNavTo(item.id);
                  }
                }}
                title={item.tooltip}
              >
                {ICONS[item.id]}
              </button>
              {item.id === 'home' && (
                <button
                  className={`pto-ide-frame__rail-button ${commonFunctionsOpen ? 'is-selected' : ''}`}
                  title="常用功能" aria-label="常用功能" aria-expanded={commonFunctionsOpen} aria-controls="common-functions"
                  onClick={() => setCommonFunctionsOpen(open => !open)}
                >
                  <SI d={['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z']} />
                </button>
              )}
              </React.Fragment>
            ))}
            <button
              ref={moreBtnRef}
              className={`pto-ide-frame__rail-button ${moreMenuOpen || moreItems.some(m => activeTabViewIds.has(m.id)) || extItems.some(id => activeTabViewIds.has(id)) ? 'is-selected' : ''}`}
              title="更多功能（预览）"
              onClick={() => {
                const r = moreBtnRef.current?.getBoundingClientRect();
                if (r) setMoreMenuPos({ top: r.top - 4, left: r.right + 10 });
                setMoreMenuOpen(v => !v);
              }}
            >
              <svg className="pto-ide-frame__rail-icon" viewBox="0 0 24 24" style={{ fill: 'currentColor', stroke: 'none' }}>
                <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
              </svg>
            </button>
          </div>

          {/* 左下角：罗盘（仓识别）+ 头像 + 设置 */}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <button
              data-repo-toggle
              className={`pto-ide-frame__rail-button ${repoHintOpen ? 'is-selected' : ''}`}
              onClick={() => (repoHintOpen ? setRepoHintOpen(false) : openRepoHint())}
              title="操作建议 · 当前工程可用能力"
            >
              <svg className="pto-ide-frame__rail-icon" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <polygon points="15.6 8.4 13.4 13.4 8.4 15.6 10.6 10.6" />
              </svg>
            </button>
            <button className="pto-ide-frame__rail-button" title="整机开发者">
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.14)', display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>开</span>
            </button>
            <button className="pto-ide-frame__rail-button" title="设置">
              <svg className="pto-ide-frame__rail-icon" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </nav>
        {moreMenuOpen && moreMenuPos && (
          <div
            className="ide-rail-more-menu"
            style={{ top: moreMenuPos.top, left: moreMenuPos.left }}
            onMouseLeave={() => setMoreMenuOpen(false)}
          >
            <div className="ide-rail-more-menu__title">更多功能 · 预览</div>
            {moreItems.map(item => (
              <button
                key={item.id}
                className="ide-rail-more-item"
                onClick={() => {
                  setMoreMenuOpen(false);
                  if (item.csrRequired) {
                    void ensureCsrLoaded().then(ok => { if (ok) openView(item.id); });
                  } else {
                    handleNavTo(item.id);
                  }
                }}
              >
                <span className="ide-rail-more-item__icon">{ICONS[item.id]}</span>
                <span className="ide-rail-more-item__label">{VIEW_LABELS[item.id]}</span>
                <span className="ide-rail-more-item__badge">Beta</span>
              </button>
            ))}
            <div className="ide-rail-more-menu__title ide-rail-more-menu__title--sub">代码辅助扩展</div>
            {extItems.map(id => (
              <button
                key={id}
                className="ide-rail-more-item"
                onClick={() => { handleNavTo(id); setMoreMenuOpen(false); }}
              >
                <span className="ide-rail-more-item__icon">{ICONS[id]}</span>
                <span className="ide-rail-more-item__label">{VIEW_LABELS[id]}</span>
              </button>
            ))}
          </div>
        )}

        {commonFunctionsOpen && (
          <aside id="common-functions" className="ide-common-functions" aria-label="常用功能">
            <div className="pto-ide-frame__pane-header ide-common-functions__header">
              <h2>常用功能</h2>
              <button className="btn btn-ghost btn-icon" aria-label="收起常用功能" onClick={() => setCommonFunctionsOpen(false)}>×</button>
            </div>
            <div className="ide-common-functions__body">
              <RepoCapabilityList onOpenView={openScenario} onRunAgent={runQuickAction} dock />
            </div>
          </aside>
        )}
        <div className="pto-ide-frame__workarea" ref={workareaRef}>
          <div className="ide-workarea-main">
            <PaneView
              node={layout}
              activePaneId={activePaneId}
              dragState={dragState}
              onActivatePane={handleActivatePane}
              onActivateTab={handleActivateTab}
              onCloseTab={handleCloseTab}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDrop={handleDrop}
              onSetRatio={handleSetRatio}
              onSplitPane={handleSplitPane}
              renderContent={renderContent}
              renderTabActions={renderTabActions}
            />
          </div>
          {termOpen && (
            <>
              <div
                className={`ide-bottom-dock__handle${termResizing ? ' is-resizing' : ''}`}
                onMouseDown={handleTermResizeMouseDown}
              />
              <div className="ide-bottom-dock" style={{ height: termHeight }}>
                <AgentTerminal
                  onOpenScenario={openScenario}
                  onClose={() => setTermOpen(false)}
                  runRequest={termCmd}
                />
              </div>
            </>
          )}
        </div>

        {aiPanelOpen && (
          <>
          <div className="ai-assist-panel__resize-handle" onMouseDown={handleResizeMouseDown} />
          <aside className="ai-assist-panel" style={{ width: aiPanelWidth }}>
            {/* 头部由 ai-assist 页面自身提供（AI 助手 + 新对话/历史/关闭），避免双重抬头 */}
            <div className="ai-assist-panel__body">
              <Suspense fallback={<ViewLoader />}>
                <AiAssistView />
              </Suspense>
            </div>
          </aside>
          </>
        )}
      </div>

      {/* 仓识别提示弹窗（从左下角罗盘按钮弹出）*/}
      {repoHintOpen && (
        <RepoHintPopover
          anchorLeft={repoAnchor.left}
          anchorBottom={repoAnchor.bottom}
          onOpenView={openScenario}
          onRunAgent={runQuickAction}
          onClose={() => setRepoHintOpen(false)}
        />
      )}

      {/* ── Status bar ── */}
      <div className="pto-ide-frame__status-strip ide-status-bar">
        <div className="ide-status-bar__group">
          <button className="ide-status-item" onClick={() => handleNavTo('bmcEnv')} title="BMC 环境管理 · 3 台 SSH 可达 / 共 5 台 · 周期检测开启（3 台）">
            <span className="ide-status-dot ide-status-dot--ok" />
            BMC 3/5 可达
          </button>
          <button className="ide-status-item" onClick={() => handleNavTo('bmcEnv')} title="SSH 会话 · 1 个活跃（BMC-A01）">
            <svg viewBox="0 0 24 24" className="ide-status-icon"><path d="M4 17l6-6-6-6" /><path d="M12 19h8" /></svg>
            SSH 1
          </button>
          <button className="ide-status-item" onClick={() => runQuickAction('agent 巡检在线 BMC')} title="Docker 编译容器 · 2 运行 / 共 3 · 点击巡检">
            <svg viewBox="0 0 24 24" className="ide-status-icon"><rect x="2" y="9" width="4" height="4" /><rect x="7" y="9" width="4" height="4" /><rect x="12" y="9" width="4" height="4" /><rect x="7" y="4" width="4" height="4" /><path d="M2 15c2 3 6 5 10 5 5 0 9-2.5 10-7-1.2.4-2.6.4-3.5-.3" /></svg>
            Docker 2/3
          </button>
          <button className="ide-status-item" onClick={() => setTermOpen(true)} title="问题统计 · 打开输出面板">
            <svg viewBox="0 0 24 24" className="ide-status-icon"><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></svg>
            0
            <svg viewBox="0 0 24 24" className="ide-status-icon"><path d="M12 3L2 20h20L12 3z" /><path d="M12 10v4M12 17.5v.01" /></svg>
            {csr ? 2 : 0}
          </button>
        </div>
        <div className="ide-status-bar__group">
          {modelInfo && (
            <span className="ide-status-item ide-status-item--static" title="当前工程">
              {modelInfo.name}{modelInfo.badge ? ` · ${modelInfo.badge}` : ''}
            </span>
          )}
          <button className="ide-status-item" onClick={() => runQuickAction('mcp')} title="已接入 MCP Server · 点击查看工具清单">
            <svg viewBox="0 0 24 24" className="ide-status-icon"><path d="M4 17l6-6-6-6" /><path d="M12 19h8" /></svg>
            MCP 7
          </button>
          <button
            className={`ide-status-item${termOpen ? ' is-active' : ''}`}
            onClick={() => setTermOpen(v => !v)}
            title="agent 终端（Ctrl+`）"
          >
            <svg viewBox="0 0 24 24" className="ide-status-icon"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M6 9l3 3-3 3M12 15h6" /></svg>
            终端
          </button>
        </div>
      </div>
    </div>
  );
}
