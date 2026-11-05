import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  GraduationCap, LayoutDashboard, UserRound, BriefcaseBusiness, CalendarDays, BookOpenCheck,
  MessageSquareText, Award, Bell, Users, ClipboardCheck, Building2, ClipboardList, Settings2,
  FileClock, ChevronLeft, ChevronRight, LogOut, Menu, X, PanelLeftClose, Sparkles, Search,
} from 'lucide-react';
import { api, authApi } from '../lib/api';

const roleMenus = {
  student: [
    { label: 'Overview', items: [{ title: 'Dashboard', to: '/dashboard', icon: LayoutDashboard }, { title: 'My profile', to: '/profile', icon: UserRound }] },
    { label: 'My attachment', items: [{ title: 'Internship placement', to: '/placement', icon: BriefcaseBusiness }, { title: 'Assessment schedule', to: '/assessments', icon: CalendarDays }, { title: 'Digital logbook', to: '/logbooks', icon: BookOpenCheck }, { title: 'Lecturer feedback', to: '/feedback', icon: MessageSquareText }, { title: 'Results & final score', to: '/results', icon: Award }] },
    { label: 'Stay updated', items: [{ title: 'Notifications', to: '/notifications', icon: Bell }] },
  ],
  lecturer: [
    { label: 'Overview', items: [{ title: 'Dashboard', to: '/dashboard', icon: LayoutDashboard }, { title: 'Assigned students', to: '/students', icon: Users }] },
    { label: 'Assessment workspace', items: [{ title: 'Assessment schedule', to: '/assessments', icon: CalendarDays }, { title: 'Logbook reviews', to: '/logbooks', icon: BookOpenCheck }, { title: 'Assessment marks', to: '/marks', icon: ClipboardCheck }, { title: 'Final results', to: '/results', icon: Award }] },
    { label: 'Stay updated', items: [{ title: 'Notifications', to: '/notifications', icon: Bell }] },
  ],
  admin: [
    { label: 'Overview', items: [{ title: 'Dashboard', to: '/dashboard', icon: LayoutDashboard }, { title: 'Users & students', to: '/students', icon: Users }] },
    { label: 'Attachment operations', items: [{ title: 'Placements', to: '/placements', icon: BriefcaseBusiness }, { title: 'Lecturer assignments', to: '/assignments', icon: GraduationCap }, { title: 'Assessment schedule', to: '/assessments', icon: CalendarDays }, { title: 'Assessment marks', to: '/marks', icon: ClipboardCheck }, { title: 'Logbook submissions', to: '/logbooks', icon: BookOpenCheck }, { title: 'Results & scores', to: '/results', icon: Award }] },
    { label: 'System management', items: [{ title: 'Academic setup', to: '/setup', icon: Settings2 }, { title: 'Notifications', to: '/notifications', icon: Bell }, { title: 'Audit trail', to: '/audit', icon: FileClock }] },
  ],
};
const pageTitle = {
  '/dashboard':'Dashboard','/profile':'My profile','/placement':'Internship placement','/placements':'Placement management','/students':'Users & students','/assignments':'Lecturer assignments','/assessments':'Assessment schedule','/logbooks':'Digital logbooks','/feedback':'Lecturer feedback','/marks':'Assessment marks','/results':'Results & final score','/setup':'Academic setup','/notifications':'Notifications','/audit':'Audit trail'
};
function initials(user) { return `${user?.first_name?.[0] || user?.username?.[0] || 'U'}${user?.last_name?.[0] || ''}`.toUpperCase(); }
function roleLabel(role) { return ({ student: 'Student workspace', lecturer: 'Lecturer workspace', admin: 'Coordinator workspace' })[role] || 'Workspace'; }

export default function AppShell({ user, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const menus = roleMenus[user?.role] || roleMenus.student;
  const title = pageTitle[location.pathname] || 'Dashboard';
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let live = true;
    const loadUnread = async () => {
      try {
        const { data } = await api.get('/notifications/');
        const items = Array.isArray(data) ? data : (data.results || []);
        if (live) setUnread(items.filter((item) => !item.is_read).length);
      } catch { /* The page-level notification view will show actionable errors. */ }
    };
    loadUnread();
    window.addEventListener('ims:notifications-updated', loadUnread);
    return () => { live = false; window.removeEventListener('ims:notifications-updated', loadUnread); };
  }, [location.pathname, user?.id]);
  return <div className={`app-layout ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'mobile-sidebar-open' : ''}`}>
    {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation"/>}
    <aside className="sidebar">
      <div className="brand-row"><div className="brand-mark"><GraduationCap size={22}/></div>{!collapsed && <div className="brand-copy"><span>attachly</span><small>INDUSTRIAL ATTACHMENT</small></div>}<button className="sidebar-collapse icon-button" onClick={() => setCollapsed((x) => !x)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <ChevronRight size={17}/> : <PanelLeftClose size={17}/>}</button><button className="mobile-sidebar-close icon-button" onClick={() => setMobileOpen(false)} aria-label="Close sidebar"><X size={18}/></button></div>
      <div className="workspace-pill"><span className="workspace-orb"><Sparkles size={14}/></span>{!collapsed && <span>{roleLabel(user?.role)}</span>}</div>
      <nav className="side-navigation" aria-label="Primary navigation">{menus.map((group) => <div className="nav-group" key={group.label}><div className="nav-group-label">{!collapsed && group.label}</div>{group.items.map(({ title: navTitle, to, icon: Icon }) => <NavLink key={to} to={to} title={collapsed ? navTitle : undefined} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Icon size={18}/>{!collapsed && <span>{navTitle}</span>}{to === '/notifications' && unread > 0 && !collapsed && <span className="nav-count">{unread}</span>}</NavLink>)}</div>)}</nav>
      {!collapsed && <div className="sidebar-bottom-card"><div className="sidebar-bottom-icon"><Sparkles size={17}/></div><strong>One place for every step.</strong><p>Keep your attachment journey clear, organized and on track.</p></div>}
      <div className="sidebar-user"><div className="avatar avatar-blue">{initials(user)}</div>{!collapsed && <div className="sidebar-user-copy"><strong>{user?.first_name ? `${user.first_name} ${user.last_name || ''}` : user?.username}</strong><span>{user?.email}</span></div>}{!collapsed && <button className="icon-button user-logout" onClick={onLogout} title="Log out" aria-label="Log out"><LogOut size={17}/></button>}</div>
    </aside>
    <div className="main-column">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={21}/></button><div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{title}</strong></div></div><div className="topbar-right"><div className="topbar-status"><span className="live-dot"/> All systems operational</div><button className="icon-button topbar-bell" onClick={() => navigate('/notifications')} aria-label={`View notifications${unread ? `, ${unread} unread` : ''}`}><Bell size={19}/>{unread > 0 && <span className="topbar-bell-count">{unread > 9 ? '9+' : unread}</span>}</button><button className="topbar-profile" onClick={() => navigate(user?.role === 'student' ? '/profile' : '/dashboard')}><div className="avatar avatar-small">{initials(user)}</div><div><strong>{user?.first_name || user?.username}</strong><span>{user?.role === 'admin' ? 'Coordinator' : user?.role === 'lecturer' ? 'Lecturer' : 'Student'}</span></div><ChevronLeft className="profile-chevron" size={15}/></button><button className="icon-button topbar-logout" onClick={onLogout} aria-label="Log out" title="Log out"><LogOut size={17}/></button></div></header>
      <main className="page-content"><Outlet /></main>
      <footer className="app-footer"><span>© {new Date().getFullYear()} Attachly Internship Management</span><span>Built for better attachment outcomes <span className="footer-heart">✦</span></span></footer>
    </div>
  </div>;
}
