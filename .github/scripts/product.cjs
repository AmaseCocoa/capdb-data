function isEan13(code) {
  if (typeof code !== 'string' || code.length !== 13 || !/^[0-9]{13}$/.test(code)) return false;
  const sum = [...code].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return sum % 10 === 0;
}

function separateJanCode(code) {
  if (!isEan13(code)) return null;
  const prefix = Number(code.slice(0, 5));
  const within = (min, max) => prefix >= min && prefix <= max;
  let length = 8;
  if (within(49010, 49204)) length = 6;
  else if ([[45700, 45709], [45731, 45735], [45800, 45809],
    [45825, 45826], [45894, 45898], [45951, 45959]].some(([a, b]) => within(a, b))) length = 9;
  return { country: code.slice(0, 3), company: code.substring(3, 3 + length),
    product: code.substring(3 + length, 12), cd: code.slice(-1) };
}

function productPath(jan) {
  const split = separateJanCode(jan);
  return split ? `data/${split.country}/${split.company}/${split.product}.json` : null;
}

// schema.json の制約をIssue FormsとPRの両方に適用する。
function validateProduct(data, schema = require('../../schema.json'), field = '$') {
  const errors = [];
  function visit(value, rule, path) {
    const type = rule.type;
    const validType = type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
      : type === 'integer' ? Number.isInteger(value) : typeof value === type;
    if (!validType) { errors.push(`${path}: ${type} 型で入力してください。`); return; }
    if (type === 'object') {
      for (const key of rule.required || []) {
        if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}: 必須項目です。`);
      }
      for (const [key, item] of Object.entries(value)) {
        if (Object.hasOwn(rule.properties || {}, key)) visit(item, rule.properties[key], `${path}.${key}`);
        else if (rule.additionalProperties === false) errors.push(`${path}.${key}: 未定義の項目です。`);
      }
    }
    if (type === 'string') {
      if (rule.minLength !== undefined && value.trim().length < rule.minLength) errors.push(`${path}: 空欄にできません。`);
      if (rule.pattern && !new RegExp(rule.pattern).test(value)) errors.push(`${path}: 形式が不正です。`);
      if (rule.format === 'uri') {
        try {
          const url = new URL(value);
          if (!['http:', 'https:'].includes(url.protocol) || /\s/.test(value)) throw new Error();
        } catch { errors.push(`${path}: http または https のURLを入力してください。`); }
      }
    }
    if (type === 'integer' && (value < rule.minimum || value > rule.maximum)) errors.push(`${path}: ${rule.minimum}〜${rule.maximum} の整数を入力してください。`);
  }
  visit(data, schema, field);
  if (data && typeof data === 'object' && Object.hasOwn(data, 'jan') && !isEan13(data.jan)) {
    errors.push(`${field}.jan: チェックディジットが正しいEAN-13（13桁の半角数字）を入力してください。`);
  }
  return errors;
}
module.exports = { isEan13, separateJanCode, productPath, validateProduct };
