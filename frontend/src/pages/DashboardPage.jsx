import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, ArrowDownRight, ArrowRight, Award, BookOpen, BookOpenCheck, BriefcaseBusiness,
  CalendarDays, CheckCircle2, ClipboardCheck, Clock3, FileCheck2, GraduationCap, RefreshCw,
  Users, Sparkles, Building2, ChevronRight, FileText, CircleHelp,
} from 'lucide-react';
import { BarChart, Bar, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, getErrorMessage } from '../lib/api';
import { PageHeading, StatCard, StatusBadge, LoadingState, ErrorState, useToast } from '../components/common';

const iconMap = { users: Users, 'graduation-cap': GraduationCap, 'clipboard-check': ClipboardCheck, 'briefcase-business': BriefcaseBusiness, 'calendar-days': CalendarDays, 'book-open-check': BookOpenCheck, award: Award, 'check-circle-2': CheckCircle2, 'clock-3': Clock3, 'chart-no-axes-combined': Activity, 'book-open': BookOpen, 'circle-help': CircleHelp };
const chartColors = ['#3b82f6','#8b5cf6','#06b6d4','#f59e0b','#10b981','#f472b6','#64748b'];
const dateOptions = { weekday: 'long', month: 'long', day: 'numeric' };
function Greeting({ user }) {
  const hour = new Date().getHours();
  const prefix = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return <div className="greeting-line"><span>{prefix}, {user?.first_name || user?.username}.</span><span className="greeting-sparkle">✦</span></div>;
}
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip"><span>{label || payload[0].name}</span><strong>{payload[0].value}</strong></div>;
}
function PanelTitle({ icon: Icon, title, subtitle, to, linkLabel = 'View all' }) {
  return <div className="panel-title-row"><div className="panel-title-icon"><Icon size={17}/></div><div className="panel-title-copy"><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{to && <Link className="text-link" to={to}>{linkLabel}<ArrowRight size={14}/></Link>}</div>;
}
function AdminDashboard({ data }) {
  const charts = data.charts || {};
  const placementData = charts.placements || [];
  const departmentData = charts.departments || [];
  return <>
    <div className="dashboard-grid admin-chart-grid">
      <section className="panel chart-panel"><PanelTitle icon={Building2} title="Students by department" subtitle="Student distribution across academic units"/><div className="chart-area chart-area-tall">{departmentData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={departmentData} margin={{ top: 10, right: 12, left: -18, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf1f7"/><XAxis dataKey="label" tick={{ fill:'#7c879b', fontSize:11 }} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{ fill:'#7c879b', fontSize:11 }} axisLine={false} tickLine={false}/><Tooltip content={<ChartTooltip/>}/><Bar dataKey="value" radius={[6,6,0,0]} maxBarSize={44}>{departmentData.map((d,i)=><Cell fill={chartColors[i%chartColors.length]} key={d.label}/>)}</Bar></BarChart></ResponsiveContainer> : <div className="chart-empty">Department statistics will appear as students are registered.</div>}</div></section>
      <section className="panel chart-panel"><PanelTitle icon={BriefcaseBusiness} title="Placement pipeline" subtitle="Current placement approval status"/><div className="chart-area donut-chart-area">{placementData.length ? <><ResponsiveContainer width="100%" height="78%"><PieChart><Pie data={placementData} dataKey="value" nameKey="label" innerRadius={62} outerRadius={88} paddingAngle={3} stroke="none">{placementData.map((d,i)=><Cell key={d.label} fill={chartColors[i%chartColors.length]}/>)}</Pie><Tooltip content={<ChartTooltip/>}/></PieChart></ResponsiveContainer><div className="chart-legend">{placementData.map((x,i)=><div key={x.label}><span style={{background:chartColors[i%chartColors.length]}}/>{x.label}<strong>{x.value}</strong></div>)}</div></> : <div className="chart-empty">Placement statuses will appear here.</div>}</div></section>
    </div>
    <section className="panel activity-panel"><PanelTitle icon={Activity} title="Recent system activity" subtitle="Important changes across the platform"/><div className="activity-list">{data.recent_activity?.length ? data.recent_activity.map((item, index)=><div className="activity-item" key={`${item.id}-${index}`}><div className={`activity-marker activity-marker-${index%4}`}><Activity size={15}/></div><div className="activity-item-main"><strong>{item.title}</strong><span>{item.description}</span></div><div className="activity-item-meta"><span>{item.actor}</span><time>{new Date(item.time).toLocaleDateString()}</time></div></div>) : <div className="inset-empty">No system activity recorded yet.</div>}</div></section>
  </>;
}
function LecturerDashboard({ data }) {
  return <div className="dashboard-grid lecturer-grid"><section className="panel students-panel"><PanelTitle icon={Users} title="Students to keep an eye on" subtitle="Your current supervision list" to="/students"/><div className="table-scroll"><table className="data-table"><thead><tr><th>Student</th><th>Programme</th><th>Placement</th><th/></tr></thead><tbody>{(data.students||[]).slice(0,7).map(s=><tr key={s.id}><td><div className="student-table-name"><div className="avatar avatar-soft">{s.name?.split(' ').map(n=>n[0]).slice(0,2).join('')}</div><div><strong>{s.name}</strong><small>{s.registration_number}</small></div></div></td><td>{s.programme}</td><td><StatusBadge status={s.placement_status?.replaceAll(' ','_')}>{s.placement_status}</StatusBadge></td><td><Link className="table-arrow" to="/students"><ChevronRight size={17}/></Link></td></tr>)}</tbody></table></div>{!data.students?.length && <div className="inset-empty">No students assigned yet. Ask your coordinator to create an assignment.</div>}</section>
  <section className="panel upcoming-panel"><PanelTitle icon={CalendarDays} title="Coming up next" subtitle="Your next scheduled assessments" to="/assessments"/>{data.upcoming_assessments?.length ? <div className="upcoming-list">{data.upcoming_assessments.map(a=><div className="upcoming-item" key={a.id}><div className="date-tile"><strong>{new Date(`${a.assessment_date}T12:00:00`).getDate()}</strong><span>{new Date(`${a.assessment_date}T12:00:00`).toLocaleDateString(undefined,{month:'short'})}</span></div><div className="upcoming-item-content"><strong>{a.student_name}</strong><span>{a.assessment_type}</span><small><Clock3 size={12}/>{a.start_time?.slice(0,5)} · {a.mode==='online'?'Online':'On-site'}</small></div><StatusBadge status={a.status}/></div>)}</div> : <div className="inset-empty">No upcoming assessments scheduled.</div>}</section></div>;
}
function StudentDashboard({ data, user }) {
  const placement = data.placement;
  const upcoming = data.upcoming_assessments || [];
  const [profile, setProfile] = useState(null);
  useEffect(() => { api.get('/student-profiles/').then(({data:d})=>{const list=Array.isArray(d)?d:d.results||[];setProfile(list[0]||null)}).catch(()=>{}); }, []);
  return <div className="dashboard-grid student-grid"><div className="student-main-column"><section className="panel journey-panel"><div className="journey-panel-head"><div><span className="eyebrow">YOUR ATTACHMENT JOURNEY</span><h3>Small steps. Real progress.</h3><p>Keep each part of your industrial attachment moving forward.</p></div><div className="journey-illustration"><div className="journey-illustration-ring"><GraduationCap size={26}/></div><span className="journey-star star-a">✦</span><span className="journey-star star-b">✧</span><span className="journey-dot dot-a"/><span className="journey-dot dot-b"/></div></div><div className="progress-summary"><div><strong>{data.progress?.completed || 0} <span>of {data.progress?.total || 5} milestones</span></strong><span className="progress-percent">{Math.round(((data.progress?.completed||0)/(data.progress?.total||5))*100)}%</span></div><div className="progress-track"><span style={{width:`${Math.round(((data.progress?.completed||0)/(data.progress?.total||5))*100)}%`}}/></div></div><div className="milestone-list">{(data.progress?.steps||[]).map((step,i)=>{const completed=i<(data.progress?.completed||0);return <div className={`milestone ${completed?'milestone-complete':''}`} key={step}><span className="milestone-number">{completed?<CheckCircle2 size={17}/>:`0${i+1}`}</span><span>{step}</span>{i===data.progress?.completed&&!completed&&<span className="milestone-next">NEXT UP</span>}</div>})}</div></section>
  <section className="panel upcoming-panel"><PanelTitle icon={CalendarDays} title="Your next assessments" subtitle="Be prepared for upcoming visits" to="/assessments"/>{upcoming.length ? <div className="upcoming-list">{upcoming.map(a=><div className="upcoming-item" key={a.id}><div className="date-tile"><strong>{new Date(`${a.assessment_date}T12:00:00`).getDate()}</strong><span>{new Date(`${a.assessment_date}T12:00:00`).toLocaleDateString(undefined,{month:'short'})}</span></div><div className="upcoming-item-content"><strong>{a.assessment_type}</strong><span>{a.lecturer_name || 'Academic supervisor'}</span><small><Clock3 size={12}/>{a.start_time?.slice(0,5)} · {a.mode==='online'?'Online':'On-site'}</small></div><StatusBadge status={a.status}/></div>)}</div>:<div className="empty-inline"><div className="empty-calendar"><CalendarDays size={23}/></div><div><strong>No visits on your calendar yet</strong><p>Your supervisor's assessment schedule will show up here.</p></div></div>}</section></div>
  <div className="student-side-column"><section className="panel placement-summary-panel"><PanelTitle icon={BriefcaseBusiness} title="My placement"/><div className="placement-company-mark"><Building2 size={22}/></div><h3>{placement?.company_name || 'Placement not registered'}</h3><p>{placement?.position_title || 'Register your internship placement to get started.'}</p>{placement && <div className="placement-status-row"><span>Registration status</span><StatusBadge status={placement.status}/></div>}<div className="placement-divider"/>{placement ? <><div className="placement-detail-row"><span>Attachment period</span><strong>{placement.period_name || placement.attachment_period}</strong></div><div className="placement-detail-row"><span>Start date</span><strong>{placement.start_date}</strong></div><div className="placement-detail-row"><span>End date</span><strong>{placement.end_date}</strong></div></> : <div className="placement-detail-row"><span>Next action</span><strong>Complete your registration</strong></div>}<Link className="btn btn-secondary btn-full" to="/placement">{placement ? 'View placement details':'Register placement'} <ArrowRight size={15}/></Link></section>
  <section className="student-tip-card"><div className="tip-icon"><Sparkles size={17}/></div><div><span className="eyebrow">A LITTLE REMINDER</span><h3>Consistency counts.</h3><p>Upload your weekly logbook while the details are fresh. Your future self will thank you.</p><Link to="/logbooks">Open digital logbook <ArrowRight size={14}/></Link></div></section>
  </div></div>;
}

export default function DashboardPage({ user }) {
  const [data,setData] = useState(null); const [busy,setBusy]=useState(true); const [error,setError]=useState(''); const toast=useToast();
  async function load(){setBusy(true);setError('');try{const response=await api.get('/dashboard/');setData(response.data)}catch(e){setError(getErrorMessage(e))}finally{setBusy(false)}}
  useEffect(()=>{load()},[]);
  const cards=data?.cards||[];
  return <div className="page-stack"><PageHeading eyebrow={user?.role==='admin'?'ADMINISTRATION':user?.role==='lecturer'?'SUPERVISION':'STUDENT PORTAL'} title={user?.role==='admin'?'Institution overview':user?.role==='lecturer'?'Supervision overview':'Your attachment overview'} description={user?.role==='admin'?'A real-time snapshot of placements, progress and assessment activity.':user?.role==='lecturer'?'Keep track of student progress, scheduled visits and reviews.':'A calm space to manage your placement, weekly records and assessment milestones.'} actions={<button className="btn btn-secondary" onClick={load} disabled={busy}><RefreshCw size={15} className={busy?'spin':''}/> Refresh</button>}/>
    {user?.role==='student'&&<Greeting user={user}/>}
    {busy ? <LoadingState/> : error ? <ErrorState message={error} onRetry={load}/> : <>
      <div className={`stats-grid ${cards.length>4?'stats-grid-wide':''}`}>{cards.map((item,index)=><StatCard key={item.label} item={item} icon={iconMap[item.icon]} index={index}/>)}</div>
      {data.role==='admin' ? <AdminDashboard data={data}/> : data.role==='lecturer' ? <LecturerDashboard data={data}/> : <StudentDashboard data={data} user={user}/>}
      <div className="dashboard-bottom-note"><div className="bottom-note-icon"><FileCheck2 size={16}/></div><span>Changes are saved to the system and your access is limited to records permitted for your role.</span><Link to="/notifications">View updates <ArrowRight size={13}/></Link></div>
    </>}
  </div>;
}
