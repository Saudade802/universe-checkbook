import { LIMIT, validateFields, type Fields, type FieldErrors, type SavedCheck } from "./checks";

export type Submission = { used: number; success: boolean; check?: SavedCheck; errors?: FieldErrors; message: string };
type State = { used: number; latest: SavedCheck | null; attempts: Record<string, Submission> };
const initial = (): State => ({ used: 0, latest: null, attempts: {} });

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("universe-checkbook-guest", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("checks");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("无法保存浏览器数据，请允许此网站使用本地存储后重试。"));
    request.onblocked = () => reject(new Error("请关闭其他旧版网页后重试。"));
  });
}

export async function readBrowserStatus(): Promise<{ used: number; latest: SavedCheck | null }> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("checks", "readonly");
    const request = tx.objectStore("checks").get("current");
    tx.oncomplete = () => { db.close(); const state: State = request.result ?? initial(); resolve({ used: state.used, latest: state.latest }); };
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error("无法读取填写记录，请重试。")); };
  });
}

export async function submitBrowserCheck(attempt: { requestId: string; fields: Fields }): Promise<Submission> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    // One transaction serializes simultaneous tabs and commits the quota and result together.
    const tx = db.transaction("checks", "readwrite");
    const store = tx.objectStore("checks");
    const request = store.get("current");
    let result: Submission;
    request.onsuccess = () => {
      const state: State = request.result ?? initial();
      const previous = state.attempts[attempt.requestId];
      if (previous) { result = { ...previous, used: state.used }; return; }
      if (state.used >= LIMIT) { result = { used: LIMIT, success: false, message: "50次填写机会已用完，仍可下载最近成功的支票。" }; return; }
      const { fields, errors } = validateFields(attempt.fields);
      state.used += 1;
      const success = Object.keys(errors).length === 0;
      const check = success ? { requestId: attempt.requestId, fields, createdAt: new Date().toISOString() } : undefined;
      result = { used: state.used, success, ...(check ? { check } : { errors }), message: success ? "支票已成功生成，可以下载PNG或JPG图片。" : "本次提交已计入，请修改标出的信息后再次提交。" };
      if (check) state.latest = check;
      state.attempts[attempt.requestId] = result;
      store.put(state, "current");
    };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error("本次保存暂未完成，请重试；同一次提交不会重复扣次。")); };
  });
}
