import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { firebaseAuth } from './lib/firebase';
import { Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { GraduationCap, LoaderCircle } from 'lucide-react';
import { authApi } from './lib/api';
import { ToastProvider } from './components/common';
import AppShell from './components/AppShell';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import PlacementsPage from './pages/PlacementsPage';
import AssessmentsPage from './pages/AssessmentsPage';
import LogbooksPage from './pages/LogbooksPage';
import StudentsPage from './pages/StudentsPage';
import AssignmentsPage from './pages/AssignmentsPage';
import ResultsPage from './pages/ResultsPage';
import MarksPage from './pages/MarksPage';
import SetupPage from './pages/SetupPage';
import NotificationsPage from './pages/NotificationsPage';
import FeedbackPage from './pages/FeedbackPage';
import ProfilePage from './pages/ProfilePage';
import AuditPage from './pages/AuditPage';

function FullScreenLoader() { return <div className="app-loading-screen"><div className="app-loading-logo"><GraduationCap size={25}/></div><LoaderCircle size={22} className="spin"/><span>Preparing your workspace…</span></div>; }
function PrivateLayout({ user, onLogout }) { return <AppShell user={user} onLogout={onLogout}/>; }
function RoleGuard({ user, allow, children }) { return allow.includes(user?.role) ? children : <Navigate to="/dashboard" replace/>; }

export default function App() {
  const navigate=useNavigate(); const [user,setUser]=useState(null); const [authChecking,setAuthChecking]=useState(true);
  useEffect(()=>{
    let live=true;
    const unsubscribe=onAuthStateChanged(firebaseAuth, async (firebaseUser)=>{
      if(!live) return;
      if(!firebaseUser){setUser(null);setAuthChecking(false);return;}
      setAuthChecking(true);
      try {
        const data=await authApi.me();
        if(live)setUser(data);
      } catch {
        await authApi.logout().catch(()=>{});
        if(live)setUser(null);
      } finally {
        if(live)setAuthChecking(false);
      }
    });
    const onUnauthorized=async()=>{await authApi.logout().catch(()=>{});if(live){setUser(null);navigate('/login',{replace:true})}};
    window.addEventListener('ims:unauthorized',onUnauthorized);
    return()=>{live=false;unsubscribe();window.removeEventListener('ims:unauthorized',onUnauthorized)};
  },[]);
  async function handleLogin(email,password){const userData=await authApi.login(email,password);setUser(userData);navigate('/dashboard',{replace:true});}
  async function handleLogout(){await authApi.logout();setUser(null);navigate('/login',{replace:true});}
  if(authChecking)return <FullScreenLoader/>;
  return <ToastProvider><Routes>
    <Route path="/login" element={user?<Navigate to="/dashboard" replace/>:<LoginPage onLogin={handleLogin}/>}/>
    <Route element={user?<PrivateLayout user={user} onLogout={handleLogout}/>:<Navigate to="/login" replace/>}>
      <Route index element={<Navigate to="/dashboard" replace/>}/>
      <Route path="dashboard" element={<DashboardPage user={user}/>}/>
      <Route path="profile" element={<ProfilePage user={user} onUserUpdate={setUser}/>}/>
      <Route path="placement" element={<RoleGuard user={user} allow={['student']}><PlacementsPage user={user}/></RoleGuard>}/>
      <Route path="placements" element={<RoleGuard user={user} allow={['admin']}><PlacementsPage user={user}/></RoleGuard>}/>
      <Route path="students" element={<RoleGuard user={user} allow={['admin','lecturer']}><StudentsPage user={user}/></RoleGuard>}/>
      <Route path="assignments" element={<RoleGuard user={user} allow={['admin']}><AssignmentsPage user={user}/></RoleGuard>}/>
      <Route path="assessments" element={<AssessmentsPage user={user}/>}/>
      <Route path="logbooks" element={<LogbooksPage user={user}/>}/>
      <Route path="feedback" element={<RoleGuard user={user} allow={['student']}><FeedbackPage/></RoleGuard>}/>
      <Route path="marks" element={<RoleGuard user={user} allow={['admin','lecturer']}><MarksPage user={user}/></RoleGuard>}/>
      <Route path="results" element={<ResultsPage user={user}/>}/>
      <Route path="setup" element={<RoleGuard user={user} allow={['admin']}><SetupPage user={user}/></RoleGuard>}/>
      <Route path="notifications" element={<NotificationsPage/>}/>
      <Route path="audit" element={<RoleGuard user={user} allow={['admin']}><AuditPage/></RoleGuard>}/>
      <Route path="*" element={<Navigate to="/dashboard" replace/>}/>
    </Route>
  </Routes></ToastProvider>;
}
