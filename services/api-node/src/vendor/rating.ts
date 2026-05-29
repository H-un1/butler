// 보수업체 평점 집계 — 순수 함수(부수효과 없음)로 테스트가 용이하다.
// 리뷰 배열을 받아 평균 평점(소수 1자리)과 리뷰 수를 산출한다.

export type RatingSummary = {
  avgRating: number; // 평균 평점, 소수 1자리. 리뷰 없으면 0
  reviewCount: number; // 리뷰 개수
};

/**
 * 리뷰 목록으로부터 평균 평점과 리뷰 수를 계산한다.
 * - 리뷰가 없으면 avgRating 0, reviewCount 0
 * - 평균은 소수점 첫째 자리까지 반올림(예: [4,5,3] → 4.0)
 */
export function computeRating(reviews: { rating: number }[]): RatingSummary {
  const reviewCount = reviews.length;
  if (reviewCount === 0) {
    return { avgRating: 0, reviewCount: 0 };
  }
  const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
  // 소수 1자리 반올림 (Math.round로 부동소수 오차 최소화)
  const avgRating = Math.round((sum / reviewCount) * 10) / 10;
  return { avgRating, reviewCount };
}
