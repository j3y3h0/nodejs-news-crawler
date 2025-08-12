/**
 * 한국 기준(Date 객체 자체를 KST 시각으로 보이도록 UTC+9 보정) ISO 시간
 * 주의: DB/서버 표준은 UTC 권장이나, 요구사항에 따라 KST를 직접 저장하기 위해 +9h 적용
 * @param {number} day 추가 일수 (옵션)
 * @returns {Date}
 */
function getCurrentIsoTime(day = 0) {
  const nowUtc = new Date();
  const addHours = 9 + (day > 0 ? day * 24 : 0);
  return new Date(nowUtc.getTime() + addHours * 60 * 60 * 1000);
}

module.exports = { getCurrentIsoTime };
