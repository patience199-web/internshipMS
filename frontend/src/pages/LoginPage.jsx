import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, GraduationCap, LockKeyhole, Mail, Sparkles, ShieldCheck, CalendarCheck, BookOpenCheck } from 'lucide-react';
import { useToast } from '../components/common';
import { getErrorMessage } from '../lib/api';

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await onLogin(email.trim(), password); toast('Welcome back. Your workspace is ready.'); }
    catch (err) { setError(getErrorMessage(err) || 'Sign in failed. Check your email address and password.'); }
    finally { setBusy(false); }
  }
  return <div className="login-screen">
    <section className="login-art-panel"><div className="login-art-grid"/><div className="login-brand"><div className="brand-mark brand-mark-light"><GraduationCap size={24}/></div><span>attachly</span></div>
      <div className="login-art-content"><div className="login-kicker"><span className="kicker-star"><Sparkles size={15}/></span> YOUR ATTACHMENT, IN ONE PLACE</div><h1>From first day<br/>to <span>final result.</span></h1><p>A clearer way to manage industrial attachment. Bring your placement, logbook, assessments and feedback into one connected workspace.</p>
        <div className="login-feature-list"><div><span className="login-feature-icon"><CalendarCheck size={18}/></span><span><strong>Every milestone, visible</strong><small>See what is next and what needs your attention.</small></span></div><div><span className="login-feature-icon"><BookOpenCheck size={18}/></span><span><strong>Your progress, organized</strong><small>Keep weekly records and supervisor feedback together.</small></span></div><div><span className="login-feature-icon"><ShieldCheck size={18}/></span><span><strong>Built around your role</strong><small>Secure access for students, lecturers and coordinators.</small></span></div></div>
      </div><div className="login-art-footer"><span>ACADEMIC ATTACHMENT MANAGEMENT</span><span>01 — 03</span></div>
    </section>
    <section className="login-form-panel"><div className="login-form-wrap"><div className="login-mobile-brand"><div className="brand-mark"><GraduationCap size={21}/></div><strong>attachly</strong></div><div className="login-form-heading"><div className="form-welcome-icon"><Sparkles size={18}/></div><span className="eyebrow">WELCOME BACK</span><h2>Sign in to your<br/>workspace</h2><p>Enter your email address and password to continue.</p></div>
      <form className="login-form" onSubmit={submit}><label className="form-field"><span className="field-label">Email address</span><div className="input-with-icon"><Mail size={17}/><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@institution.edu" type="email" autoComplete="email" required autoFocus/></div></label>
        <label className="form-field"><span className="field-label">Password</span><div className="input-with-icon"><LockKeyhole size={17}/><input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required/><button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>
        {error && <div className="login-error">{error}</div>}<button className="btn btn-primary login-submit" type="submit" disabled={busy}>{busy ? <><span className="button-spinner"/> Signing you in…</> : <>Sign in <ArrowRight size={17}/></>}</button>
      </form><div className="login-secure-note"><ShieldCheck size={16}/><span>Your account is protected with secure authentication.</span></div><div className="login-help">Need access? Contact your attachment coordinator to set up your account.</div></div><div className="login-copyright">Attachly <span>·</span> Internship Management System</div></section>
  </div>;
}
