-- Phase 2 (M2) — Settlement·SettlementEvent 추가
-- 02_DATA_MODEL.md의 Settlement(수선비 정산, 룰베이스) 활성화.
-- 산출 결과(lines)·근거(basis)는 동결 스냅샷으로 JSON 컬럼에 보관.
-- 보증금 자동공제 없음 — 합의(AGREED) 후 (mock)결제로 분리(M3).

CREATE TABLE `Settlement` (
  `id`            VARCHAR(191) NOT NULL,
  `leaseId`       VARCHAR(191) NOT NULL,
  `inspectionId`  VARCHAR(191) NULL,
  `landlordId`    VARCHAR(191) NOT NULL,
  `tenantId`      VARCHAR(191) NULL,
  `status`        ENUM('DRAFT','PROPOSED','DISPUTED','AGREED','REJECTED') NOT NULL DEFAULT 'DRAFT',
  `ruleVersion`   VARCHAR(191) NOT NULL,
  `totalCost`     INT NOT NULL,
  `tenantTotal`   INT NOT NULL,
  `landlordTotal` INT NOT NULL,
  `lines`         JSON NOT NULL,
  `basis`         JSON NOT NULL,
  `createdAt`     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`     DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `Settlement_leaseId_idx`(`leaseId`),
  INDEX `Settlement_landlordId_idx`(`landlordId`),
  INDEX `Settlement_tenantId_idx`(`tenantId`),
  INDEX `Settlement_status_idx`(`status`),
  CONSTRAINT `Settlement_leaseId_fkey` FOREIGN KEY (`leaseId`) REFERENCES `Lease`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SettlementEvent` (
  `id`            VARCHAR(191) NOT NULL,
  `settlementId`  VARCHAR(191) NOT NULL,
  `actorId`       VARCHAR(191) NOT NULL,
  `type`          ENUM('COMPUTED','PROPOSED','DISPUTED','AGREED','REJECTED','COMMENT') NOT NULL,
  `note`          TEXT NULL,
  `createdAt`     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `SettlementEvent_settlementId_createdAt_idx`(`settlementId`, `createdAt`),
  CONSTRAINT `SettlementEvent_settlementId_fkey` FOREIGN KEY (`settlementId`) REFERENCES `Settlement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
