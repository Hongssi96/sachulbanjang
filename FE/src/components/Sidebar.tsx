import {
  ArrowDownLeft,
  ArrowUpRight,
  CircleHelp,
  ClipboardList,
  Factory,
  History,
  House,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Package,
  CalendarDays,
  FileChartColumn,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router';
import logo from '../assets/logo.png';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate: (name: string) => void;
  onAssistant: () => void;
  active: string;
}
const menus = [
  { label: '홈', icon: House },
  { label: '실시간 공정', icon: Factory },
  { label: '올라온 보고', icon: ClipboardList, badge: '3' },
  { label: '생산·검사 이력', icon: History },
  { label: '재고 관리', icon: Package },
  { label: '품질 리포트', icon: FileChartColumn },
  { label: '일정 관리', icon: CalendarDays },
];
export default function Sidebar({
  collapsed,
  onToggle,
  onNavigate,
  onAssistant,
  active,
}: SidebarProps) {
  return (
    <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label="주 메뉴">
      <Link className="brand" to="/" aria-label="사출반장 홈">
        <img src={logo} alt="" />
        <span>
          사출반장<small>YOUR FACTORY PARTNER</small>
        </span>
      </Link>
      <button
        className="sidebar-search"
        onClick={() => onNavigate('과거 대화 이력 + 검색')}
        title="과거 대화 이력 + 검색"
      >
        <MessageSquare size={18} />
        <span>과거 대화 이력 + 검색</span>
        <ArrowUpRight size={15} />
      </button>
      <div className="nav-label">WORKSPACE</div>
      <nav>
        {menus.map(({ label, icon: Icon, badge }) => (
          <button
            key={label}
            className={`nav-item ${label === active ? 'active' : ''}`}
            aria-label={label}
            aria-current={label === active ? 'page' : undefined}
            onClick={() => onNavigate(label)}
            title={collapsed ? label : undefined}
          >
            <Icon size={21} strokeWidth={1.7} />
            <span>{label}</span>
            {badge && <b className="nav-badge">{badge}</b>}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button className="sidebar-assistant" onClick={onAssistant}>
          <span className="assistant-mark">
            <Sparkles size={19} />
          </span>
          <span>
            <strong>든든한 현장 파트너</strong>
            <small>사출반장에게 물어보세요</small>
          </span>
          <ArrowUpRight size={17} />
        </button>
        <div className="sidebar-status">
          <span className="status-dot" /> 예시 데이터 모드
        </div>
        <div className="sidebar-footer">
          <button onClick={() => onNavigate('사용 가이드')} title="사용 가이드">
            <CircleHelp size={18} />
            <span>도움말</span>
            <ArrowDownLeft size={14} />
          </button>
          <button aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'} onClick={onToggle}>
            {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
