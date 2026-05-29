// 내부 ID를 사용자에게 보여줄 짧은 코드로 변환하는 유틸.
// 예: prop_k0pqr666d → "K0PQR6"
// 사람친화 필드(주소·이름)가 없을 때의 fallback 표기로 사용한다.
export function shortCode(id?: string | null): string {
  if (!id) return '—';
  // prefix(prop_/usr_/lease_ 등) 제거 후 영숫자만 추려 6자리 대문자 코드로
  const raw = id.includes('_') ? id.split('_').slice(1).join('_') : id;
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6) || '—';
}
