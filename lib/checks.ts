export const LIMIT = 50;
export type Fields = { date: string; payee: string; amount: string; goal: string; author: string };
export type FieldErrors = Partial<Record<keyof Fields, string>>;
export const emptyFields: Fields = { date: "", payee: "", amount: "", goal: "", author: "" };
export type SavedCheck = { requestId: string; fields: Fields; createdAt: string };

export function validateFields(value: unknown): { fields: Fields; errors: FieldErrors } {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const fields = Object.fromEntries(Object.keys(emptyFields).map(key => [key, typeof input[key] === "string" ? input[key].trim() : ""])) as Fields;
  const errors: FieldErrors = {};
  for (const [key, label, max] of [["payee", "收款人", 30], ["goal", "用于/目标", 80], ["author", "填写人", 30]] as const) {
    if (!fields[key]) errors[key] = `请填写${label}`;
    else if ([...fields[key]].length > max) errors[key] = `${label}最多${max}个字`;
    else if (/[\u0000-\u001f\u007f]/.test(fields[key])) errors[key] = `${label}请使用单行文字`;
  }
  if (!fields.date) errors.date = "请选择日期";
  else {
    const parsed = new Date(`${fields.date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date) || fields.date < "1900-01-01" || fields.date > "9999-12-31" || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== fields.date) errors.date = "请选择有效日期（1900—9999年）";
  }
  if (!fields.amount) errors.amount = "请填写金额";
  else if (!/^\d{1,15}(?:\.\d{1,2})?$/.test(fields.amount) || Number(fields.amount) <= 0) errors.amount = "请输入大于0的金额，最多15位整数、2位小数";
  return { fields, errors };
}

export function displayAmount(amount: string) {
  if (!/^\d{1,15}(?:\.\d{1,2})?$/.test(amount)) return amount;
  const [integer, fraction = ""] = amount.split(".");
  return `¥ ${integer.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`;
}
export function displayDate(date: string) {
  const parts = date.split("-");
  return parts.length === 3 ? `${parts[0]}年${parts[1]}月${parts[2]}日` : date;
}

// D1 batches are transactional. Duplicate request IDs replay the original result.
export const INSERT_ATTEMPT = `INSERT INTO check_attempts (user_id, request_id, successful, data, errors, created_at)
  SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM check_attempts WHERE user_id = ?) < 50
  ON CONFLICT(user_id, request_id) DO NOTHING`;
