// AI 보조 화면 공용 면책 배너 (Phase 3 M5).
// 챗봇·등기부 안전진단·판례 보조는 전부 mock 데모이므로,
// 모든 AI 화면에 "실제 자문/판독이 아님"을 명시한다.

export function MockDisclaimer({
  text,
  compact,
}: {
  text?: string;
  compact?: boolean;
}) {
  const message =
    text ??
    'mock 데모입니다. 실제 법률·세무 자문이나 등기부 판독이 아니며, 의사결정의 근거로 사용할 수 없습니다.';
  return (
    <div
      role="note"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: compact ? '8px 12px' : '12px 14px',
        borderRadius: 'var(--control-radius)',
        background: '#FFF4E5',
        border: '1px solid #F2D9B0',
      }}
    >
      <span style={{ fontSize: compact ? 13 : 14, lineHeight: 1.2 }}>⚠️</span>
      <p
        style={{
          fontSize: compact ? 12 : 13,
          lineHeight: 1.5,
          color: '#8A5A12',
          fontWeight: 500,
        }}
      >
        {message}
      </p>
    </div>
  );
}
