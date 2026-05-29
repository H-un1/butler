-- HouseLogEntry append-only 강제 (04_PROJECT_SPEC "절대 하지 마")
-- 애플리케이션이 어떤 ORM 호출을 하든 DB 레벨에서 UPDATE/DELETE를 차단한다.
-- Prisma migrate 실행 후 수동으로 적용해야 함 (prisma migrate가 트리거를 관리하지 않음).

DELIMITER //

DROP TRIGGER IF EXISTS HouseLogEntry_block_update //
CREATE TRIGGER HouseLogEntry_block_update
BEFORE UPDATE ON HouseLogEntry
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'HouseLogEntry는 append-only입니다 — 수정 금지 (04_PROJECT_SPEC)';
END //

DROP TRIGGER IF EXISTS HouseLogEntry_block_delete //
CREATE TRIGGER HouseLogEntry_block_delete
BEFORE DELETE ON HouseLogEntry
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'HouseLogEntry는 append-only입니다 — 삭제 금지 (04_PROJECT_SPEC)';
END //

DELIMITER ;
