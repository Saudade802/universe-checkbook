"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, CheckCheck, ChevronRight, CircleHelp, FileImage, Orbit, RotateCcw, ShieldCheck, Sparkles, X, ZoomIn } from "lucide-react";
import { displayAmount, displayDate, emptyFields, LIMIT, type FieldErrors, type Fields, type SavedCheck } from "../lib/checks";

import { readBrowserStatus, submitBrowserCheck } from "../lib/browser-checks";

type Pending = { requestId: string; fields: Fields };
const font = '"Kaiti SC", "KaiTi", "STKaiti", "Songti SC", "SimSun", serif';

function CheckPreview({ fields, enlarged = false }: { fields: Fields; enlarged?: boolean }) {
  const text = (value: string, x: number, y: number, width: number, size = 34) => {
    const units = [...value].reduce((n, c) => n + (/[^\u0000-\u00ff]/.test(c) ? 1 : 0.62), 0);
    return <text x={x} y={y} fontSize={Math.min(size, width / Math.max(units, 1))} fontFamily={font} fill="#343e3b">{value}</text>;
  };
  return <div className={`check-paper${enlarged ? " enlarged" : ""}`} role="img" aria-label={`财富显化支票预览，收款人：${fields.payee || "未填写"}，金额：${fields.amount || "未填写"}，填写人：${fields.author || "未填写"}`}>
    <img src="/check-template.jpg" alt="宇宙无限银行财富显化支票底图" width="1495" height="1089" draggable="false" />
    <svg viewBox="0 0 1495 1089" aria-hidden="true">
      {text(displayDate(fields.date), 1140, 180, 206, 27)}
      {text(fields.payee, 540, 332, 797)}
      {text(displayAmount(fields.amount), 370, 432, 967)}
      {text(fields.goal, 463, 532, 878)}
      <text x="145" y="632" fontSize="34" fontFamily='"Microsoft YaHei", "PingFang SC", sans-serif' fontWeight="300" fill="#85877d">填写人 <tspan fontSize="29">(Filled by):</tspan></text>
      <line x1="468" y1="641" x2="1350" y2="641" stroke="#8b8c80" strokeWidth="1.25" />
      {text(fields.author, 483, 632, 855)}
    </svg>
  </div>;
}

async function downloadCheck(check: SavedCheck, format: "png" | "jpg") {
  await document.fonts.ready;
  const img = new Image();
  img.src = "/check-template.jpg";
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 2990; canvas.height = 2178;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前浏览器不支持生成图片");
  ctx.scale(2, 2);
  ctx.fillStyle = "#fafaf0"; ctx.fillRect(0, 0, 1495, 1089);
  ctx.drawImage(img, 0, 0, 1495, 1089);
  const write = (value: string, x: number, y: number, max: number, size = 34) => {
    ctx.fillStyle = "#343e3b"; ctx.font = `${size}px ${font}`;
    const measured = ctx.measureText(value).width;
    if (measured > max) ctx.font = `${size * max / measured}px ${font}`;
    ctx.fillText(value, x, y);
  };
  const f = check.fields;
  write(displayDate(f.date), 1140, 180, 206, 27);
  write(f.payee, 540, 332, 797);
  write(displayAmount(f.amount), 370, 432, 967);
  write(f.goal, 463, 532, 878);
  ctx.fillStyle = "#85877d";
  ctx.font = '300 34px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.fillText("填写人", 145, 632);
  ctx.font = '300 29px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.fillText("(Filled by):", 259, 632);
  ctx.strokeStyle = "#8b8c80"; ctx.lineWidth = 1.25;
  ctx.beginPath(); ctx.moveTo(468, 641); ctx.lineTo(1350, 641); ctx.stroke();
  write(f.author, 483, 632, 855);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("图片生成失败，请重试")), format === "png" ? "image/png" : "image/jpeg", 0.96));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = `财富显化支票_${f.payee.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")}_${f.date}.${format}`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export default function Checkbook() {
  const [fields, setFields] = useState<Fields>({ ...emptyFields });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [used, setUsed] = useState<number | null>(null);
  const [latest, setLatest] = useState<SavedCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState("info");
  const [exporting, setExporting] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [mobilePage, setMobilePage] = useState<"fill" | "download">("fill");
  const sending = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const storageKey = "universe-guest-pending-v1";
  const remaining = used === null ? null : Math.max(0, LIMIT - used);
  const accepted = !!latest && Object.keys(emptyFields).every(k => latest.fields[k as keyof Fields] === fields[k as keyof Fields].trim());
  const filled = Object.values(fields).filter(v => v.trim()).length;
  const locked = loading || used === null || busy || !!pending || remaining === 0;

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await readBrowserStatus();
      setUsed(data.used); setLatest(data.latest);
      let stored: Pending | null = null;
      try { stored = JSON.parse(sessionStorage.getItem(storageKey) || "null"); } catch { /* Browser storage is optional. */ }
      if (stored?.requestId && stored.fields) {
        setPending(stored); setFields(stored.fields);
        setMessage("上次提交结果尚未确认，请点击重试；不会重复扣次。"); setKind("info");
      } else if (data.latest) {
        setFields(data.latest.fields); setMessage("");
      } else setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "无法读取浏览器记录，请重试"); setKind("error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);
  useEffect(() => {
    if (loading) return;
    const syncPage = () => setMobilePage(window.location.hash === "#download" && accepted ? "download" : "fill");
    syncPage();
    window.addEventListener("hashchange", syncPage);
    return () => window.removeEventListener("hashchange", syncPage);
  }, [loading, accepted]);
  useEffect(() => {
    if (!window.matchMedia("(max-width: 800px)").matches) return;
    window.scrollTo({ top: 0, behavior: "instant" });
    if (mobilePage === "download") document.getElementById("mobile-result-title")?.focus({ preventScroll: true });
  }, [mobilePage]);

  function navigateMobile(page: "fill" | "download") {
    setMobilePage(page);
    window.location.hash = page === "download" ? "download" : "fill";
  }

  function startNewCheck() {
    setFields({ ...emptyFields }); setErrors({}); setMessage("");
    if (window.matchMedia("(max-width: 800px)").matches) navigateMobile("fill");
  }
  useEffect(() => {
    const refresh = () => {
      if (!sending.current) void readBrowserStatus().then(data => setUsed(data.used)).catch(() => {});
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  useEffect(() => {
    if (zoom) dialog.current?.showModal();
    else dialog.current?.close();
  }, [zoom]);

  function change(key: keyof Fields, value: string) {
    setFields(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: undefined })); setMessage("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || used === null || (!pending && (remaining === 0 || accepted))) return;
    sending.current = true; setBusy(true); setMessage("");
    const attempt = pending ?? { requestId: crypto.randomUUID(), fields: { ...fields } };
    setPending(attempt);
    try { sessionStorage.setItem(storageKey, JSON.stringify(attempt)); } catch { /* The transaction remains authoritative. */ }
    try {
      const result = await submitBrowserCheck(attempt);
      setUsed(result.used); setErrors(result.errors || {}); setMessage(result.message);
      setKind(result.success ? "success" : "error");
      if (result.check) {
        setLatest(result.check); setFields(result.check.fields);
        if (window.matchMedia("(max-width: 800px)").matches) navigateMobile("download");
      }
      setPending(null);
      try { sessionStorage.removeItem(storageKey); } catch { /* Optional storage. */ }
      if (result.errors) {
        const first = Object.keys(result.errors)[0];
        if (first) setTimeout(() => document.getElementById(first)?.focus(), 0);
      }
    } catch (error) { setMessage(`${error instanceof Error ? error.message : "保存暂未完成"} 请重试以确认本次结果。`); setKind("error"); }
    finally { sending.current = false; setBusy(false); }
  }

  async function exportImage(format: "png" | "jpg") {
    if (!accepted || !latest || exporting) return;
    setExporting(true);
    try { await downloadCheck(latest, format); setMessage(`${format.toUpperCase()}图片已准备好，请在浏览器下载中查看。`); setKind("success"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "下载失败，请重试"); setKind("error"); }
    finally { setExporting(false); }
  }

  const field = (key: keyof Fields, label: string, english: string, placeholder: string, max?: number) => <div className="field">
    <label htmlFor={key}>{label}<span>{english}</span><b aria-hidden="true">*</b></label>
    <div className={key === "amount" ? "amount-input" : undefined}>
      {key === "amount" && <span className="currency">¥</span>}
      {key === "goal" ? <textarea id={key} value={fields[key]} onChange={e => change(key, e.target.value)} placeholder={placeholder} maxLength={max} rows={2} disabled={locked} aria-required="true" aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${key}-error` : undefined} /> :
        <input id={key} type={key === "date" ? "date" : "text"} inputMode={key === "amount" ? "decimal" : undefined} min={key === "date" ? "1900-01-01" : undefined} max={key === "date" ? "9999-12-31" : undefined} value={fields[key]} onChange={e => change(key, e.target.value)} placeholder={placeholder} maxLength={max} disabled={locked} autoComplete="off" aria-required="true" aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${key}-error` : undefined} />}
      {key === "amount" && <span className="currency-name">人民币</span>}
    </div>
    {errors[key] ? <span id={`${key}-error`} className="field-error">{errors[key]}</span> : key === "goal" ? <span className="char-count">{[...fields.goal].length} / 80</span> : null}
  </div>;

  return <div className={`site-shell mobile-page-${mobilePage}`}>
    <header className="site-header"><a className="brand" href="/" aria-label="宇宙无限银行首页"><span className="brand-mark"><Orbit size={28} strokeWidth={1.3} /></span><span>宇宙无限银行<small>BANK OF THE UNIVERSE</small></span></a>
      <span className="private-note"><ShieldCheck size={14} /> 无需登录 · 直接填写</span>
    </header>
    <main>
      <section className="intro"><div className="eyebrow"><span /> MANIFESTATION CHECKBOOK</div><h1>把心中所愿，<span>写成一张支票。</span></h1><p>给愿望一个清晰的模样，也给未来的自己一份期许。</p></section>
      <div className="mobile-result-intro"><button type="button" className="text-button" onClick={() => navigateMobile("fill")}><ArrowLeft size={15} /> 返回修改信息</button><h1 id="mobile-result-title" tabIndex={-1}>你的愿望，已成为一张支票。</h1><p>选择图片格式，下载并珍藏这一刻。</p></div>
      <div className="mobile-page-steps" aria-label="制作步骤"><span className={mobilePage === "fill" ? "current" : ""}>01 填写信息</span><ChevronRight size={14} /><span className={mobilePage === "download" ? "current" : ""}>02 支票与下载</span></div>
      <div className="workspace-top"><nav className="steps" aria-label="制作步骤"><span className={!accepted ? "current" : "done"}><b>{accepted ? <Check size={12} /> : "01"}</b>填写支票</span><ChevronRight size={14} /><span className={accepted ? "done" : ""}><b>{accepted ? <Check size={12} /> : "02"}</b>确认提交</span><ChevronRight size={14} /><span className={accepted ? "current" : ""}><b>03</b>下载珍藏</span></nav><span className="private-note"><ShieldCheck size={14} /> 填写内容仅保存在你的浏览器</span></div>
      <div className="workspace">
        <section className="form-panel" aria-labelledby="form-title"><div className="panel-heading"><div><h2 id="form-title">写下你的愿望</h2><p>每一项，都让愿望更具体一点。</p></div><span className="completion">{filled}<i>/ 5</i></span></div>
          <div className={`quota${remaining === 0 ? " exhausted" : ""}`}><div><span>当前浏览器的填写机会</span><strong>{remaining === null ? "—" : remaining}<small> / 50 次</small></strong></div><div className="quota-track"><span style={{ width: `${remaining === null ? 100 : remaining * 2}%` }} /></div><p>{loading ? "正在读取浏览器记录…" : `已提交 ${used ?? "—"} 次 · 刷新页面不会重置`}</p></div>

          <form onSubmit={submit} noValidate>
            {field("date", "日期", "Date", "请选择日期")}
            {field("payee", "收款人", "Pay to", "这份丰盛，属于谁？", 30)}
            {field("amount", "金额", "Amount", "0.00", 18)}
            {field("goal", "用于 / 目标", "For / Goal", "写下这笔财富将帮助你实现的愿望", 80)}
            {field("author", "填写人", "Filled by", "签下你的名字", 30)}
            <p className="submit-note"><CircleHelp size={14} /><span>每次提交均扣除1次，填写错误也计入。<br />请检查后再提交。更换浏览器或清除网站数据会重新计数。</span></p>
            <button className="primary-button" type="submit" disabled={busy || loading || used === null || (!pending && (remaining === 0 || accepted))}>{busy ? "正在确认提交…" : pending ? "重试上次提交" : accepted ? <><CheckCheck size={17} /> 支票已成功生成</> : remaining === 0 ? "50次填写机会已用完" : <>提交并生成支票 <ArrowRight size={17} /></>}</button>
            {accepted && <button type="button" className="primary-button mobile-continue" onClick={() => navigateMobile("download")}>查看并下载支票 <ArrowRight size={17} /></button>}
            {latest && !accepted && !busy && !pending && <button type="button" className="primary-button mobile-continue" onClick={() => { setFields(latest.fields); setErrors({}); setMessage(""); navigateMobile("download"); }}>查看最近成功支票 <ArrowRight size={17} /></button>}
          </form>
          {message && <div className={`feedback ${kind}`} role={kind === "error" ? "alert" : "status"}>{message}{used === null && !loading && <button className="text-button" onClick={() => void loadStatus()}>重新读取</button>}</div>}
        </section>
        <section className="preview-panel" aria-labelledby="preview-title">
          {mobilePage === "download" && message && <div className={`feedback mobile-result-feedback ${kind}`} role={kind === "error" ? "alert" : "status"}>{message}</div>}
          <div className="preview-heading"><div><span className="live-dot" /><h2 id="preview-title">你的专属支票</h2><span className="preview-label">实时预览</span></div><button type="button" className="icon-button" onClick={() => setZoom(true)} aria-label="放大查看支票"><ZoomIn size={17} /></button></div>
          <div className="paper-stage"><CheckPreview fields={fields} /><div className="paper-caption"><span /><Sparkles size={13} /><span>先相信，再看见</span><span /></div></div>
          <div className="download-panel"><span className={`download-icon${accepted ? " ready" : ""}`}>{accepted ? <Check size={23} /> : <FileImage size={23} strokeWidth={1.4} />}</span><div className="download-copy"><h3>{accepted ? "愿望已落笔，珍藏这一刻" : "将你的愿望，珍藏成一张图片"}</h3><p>{accepted ? "2990 × 2178 高清图片 · 重复下载不扣次数" : "填完整全部5项信息，提交成功后即可下载"}</p></div><div className="download-buttons"><button onClick={() => void exportImage("png")} disabled={!accepted || exporting}><ArrowDownToLine size={15} /> PNG</button><button onClick={() => void exportImage("jpg")} disabled={!accepted || exporting}><ArrowDownToLine size={15} /> JPG</button></div></div>
          <div className="preview-bottom"><span>{accepted ? "已保存至当前浏览器" : "预览中的编辑尚未提交"}</span><div>{latest && !accepted && !busy && !pending && <button className="text-button" onClick={() => { setFields(latest.fields); setErrors({}); setMessage(""); }}>查看最近成功支票</button>}{accepted && remaining !== 0 && <button className="text-button new-check-button" onClick={startNewCheck}><RotateCcw size={18} /> 再填写一张</button>}</div></div>
          <div className="gentle-note"><span>✦</span><p>愿你带着感恩与笃定，<br className="mobile-only" />走向心中丰盛的生活。</p></div>
        </section>
      </div>
    </main>
    <footer><span>宇宙无限银行 <i>·</i> 感恩让梦想成真</span><span>愿望记录纪念用途</span></footer>
    <dialog ref={dialog} onCancel={() => setZoom(false)} onClick={e => { if (e.target === e.currentTarget) setZoom(false); }} className="preview-dialog"><div className="dialog-header"><span>支票预览</span><button className="icon-button" onClick={() => setZoom(false)} aria-label="关闭预览"><X size={21} /></button></div><CheckPreview fields={fields} enlarged /></dialog>
  </div>;
}
