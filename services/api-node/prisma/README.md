# DB 마이그레이션 운영

## 초기 셋업

```bash
# 1. .env에 DATABASE_URL 설정 (MySQL 8.x)
# 2. Prisma client 생성
npm --workspace services/api-node run db:generate

# 3. 스키마 마이그레이션 (개발용)
npm --workspace services/api-node run db:migrate

# 4. House Log append-only 트리거 적용 (수동, 한 번만)
mysql -u <user> -p <db> < prisma/migrations/0001_houselog_append_only_trigger.sql
```

## append-only 트리거

`HouseLogEntry`는 04_PROJECT_SPEC.md "절대 하지 마" 항목으로 UPDATE/DELETE가 금지된다.
애플리케이션 레이어에서도 막지만, DB 트리거로 이중 강제한다.
트리거 위반 시 `SQLSTATE 45000` 에러로 전체 트랜잭션이 롤백된다.

## 스키마 변경

- `prisma/schema.prisma` 수정 → `02_DATA_MODEL.md`도 동기화.
- 임의 스키마 변경 금지. 항상 명시적 마이그레이션 파일 생성.
