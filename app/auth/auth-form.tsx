"use client";
import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Orbit, ShieldCheck } from "lucide-react";

export default function AuthForm({ localPreview }: { localPreview: boolean }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event?: FormEvent, preview = false) {
    event?.preventDefault(); if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: preview ? "preview" : mode, email, password, name }) });
      const result = await response.json() as { signedIn?: boolean; message?: string };
      if (!response.ok) throw new Error(result.message || "登录失败，请重试");
      if (result.signedIn) window.location.assign("/");
      else { setMessage(result.message || "确认邮箱后，请回到此页面登录。"); setMode("login"); setPassword(""); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "网络连接失败，请重试"); }
    finally { setBusy(false); }
  }
  return <main className="auth-shell"><a className="auth-back" href="/"><ArrowLeft size={15} /> 返回支票</a><section className="auth-card"><span className="brand-mark auth-orbit"><Orbit size={29} strokeWidth={1.3} /></span><div className="eyebrow">BANK OF THE UNIVERSE</div><h1>{mode === "login" ? "欢迎回来" : "开启你的丰盛记录"}</h1><p className="auth-intro">登录后，珍藏属于你的每一份期许。</p><div className="auth-tabs"><button className={mode === "login" ? "selected" : ""} onClick={() => { setMode("login"); setMessage(""); }}>登录</button><button className={mode === "signup" ? "selected" : ""} onClick={() => { setMode("signup"); setMessage(""); }}>注册</button></div><form onSubmit={e => void submit(e)}>
    {mode === "signup" && <div className="field"><label htmlFor="display-name">你的名字</label><input id="display-name" value={name} onChange={e => setName(e.target.value)} maxLength={40} autoComplete="name" required disabled={busy} /></div>}
    <div className="field"><label htmlFor="email">邮箱</label><input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required maxLength={254} disabled={busy} /></div>
    <div className="field"><label htmlFor="password">密码<span>至少8位</span></label><input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} maxLength={128} autoComplete={mode === "signup" ? "new-password" : "current-password"} required disabled={busy} /></div>
    <button className="primary-button" type="submit" disabled={busy}>{busy ? "正在处理…" : mode === "signup" ? "创建我的账户" : "登录我的账户"}<ArrowRight size={16} /></button></form>
    {localPreview && <div className="local-login"><p>本地预览可直接使用测试账户</p><button className="text-button" type="button" onClick={() => void submit(undefined, true)} disabled={busy}>本地预览登录</button></div>}
    {message && <div className="feedback" role="status">{message}</div>}
    <p className="auth-assurance"><ShieldCheck size={14} /> 每个账号50次提交，填写内容仅自己可见</p></section></main>;
}
