import type { Config } from 'tailwindcss';

// 버틀러 디자인 토큰 — DESIGN/app-toss + DESIGN/admin-linear 기반.
// 메모 결정: 브랜드 컬러는 #3182F6로 통일(Linear의 #7070FF는 전부 치환).
// 임대인 화면 = Toss 라이트, 관리자 화면 = Linear 다크 (data-tone 속성으로 라우트별 분기)

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // === 통일 브랜드 (둘 다 사용) ===
        primary: '#3182F6',
        'primary-hover': '#1B64DA',
        'primary-soft': '#E8F3FF',

        // === Toss (임대인) — 라이트 ===
        toss: {
          bg: '#FFFFFF',
          'bg-muted': '#F2F4F6',
          'bg-sub': '#F9FAFB',
          fg: '#191F28',
          'fg-secondary': '#4E5968',
          'fg-muted': '#6B7684',
          border: '#E5E8EB',
          error: '#F04452',
        },

        // === Linear (관리자) — 다크 ===
        linear: {
          bg: '#08090A',
          panel: '#0F1011',
          'panel-2': '#141516',
          fg: '#F7F8F8',
          'fg-secondary': '#B4BCD0',
          'fg-muted': '#8A8F98',
          border: '#23252A',
          line: '#37393A',
          'accent-tint': '#18182F',
        },
      },
      fontFamily: {
        sans: [
          'Pretendard Variable',
          'Pretendard',
          'Toss Product Sans',
          'Inter Variable',
          '-apple-system',
          'BlinkMacSystemFont',
          'Apple SD Gothic Neo',
          'Noto Sans KR',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          'Berkeley Mono',
          'JetBrains Mono',
          'SF Mono',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      fontSize: {
        // Toss body 15px / Linear body 16px — body-toss vs body-linear 분리
        'body-toss': ['15px', { lineHeight: '1.6' }],
        'body-linear': ['16px', { lineHeight: '1.5' }],
        'label-linear': ['13px', { lineHeight: '1.4', letterSpacing: '0' }],
        'mini-linear': ['12px', { lineHeight: '1.3' }],
        'hero-toss': ['48px', { lineHeight: '1.2', fontWeight: '700' }],
      },
      fontWeight: {
        // Linear의 비표준 weights (510, 590, 680) — 변수 폰트가 없으면 가까운 정수로 폴백
        'linear-medium': '510',
        'linear-semibold': '590',
        'linear-bold': '680',
      },
      borderRadius: {
        // Toss: 8px control / 16-20px card / 24px hero
        'toss-control': '8px',
        'toss-card': '20px',
        'toss-hero': '24px',
        // Linear: 6-8px panel / 9999px button
        'linear-panel': '8px',
        'linear-sm': '6px',
      },
      boxShadow: {
        // Toss — 그레이-오파시티 다층 (블루 언더톤)
        'toss-s':
          '0 0 4px 0 rgba(2,32,71,.05), 0 4px 16px 0 rgba(2,32,71,.05)',
        'toss-m':
          '0 8px 16px 0 rgba(0,27,55,.1), 0 4px 8px 0 rgba(2,32,71,.05)',
        'toss-l':
          '0 24px 40px 0 rgba(0,23,51,.02), 0 16px 24px 0 rgba(0,27,55,.1), 0 0 8px 0 rgba(2,32,71,.05)',
        // Linear — hairline-as-shadow (거의 그림자 없음, ring으로 구조 표현)
        'linear-hairline': 'inset 0 0 0 1px #23252A',
        'linear-ring': 'inset 0 0 0 2px #3182F6',
      },
      transitionTimingFunction: {
        'toss-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'linear-out': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      },
    },
  },
  plugins: [],
} satisfies Config;
