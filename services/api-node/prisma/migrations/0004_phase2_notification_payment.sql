-- Phase 2 (M3) — Notification·Payment 추가
-- 02_DATA_MODEL.md의 Notification, Payment(PG) 활성화.
-- ⚠️ 알림 발송(카카오/SMS)·PG 결제는 mock 어댑터로만 동작(실 호출 0).
-- 보증금 자동공제 없음 — 정산은 합의 후 별도 결제로만 처리.

CREATE TABLE `Notification` (
  `id`          VARCHAR(191) NOT NULL,
  `recipientId` VARCHAR(191) NOT NULL,
  `type`        ENUM('CONTRACT_EXPIRY','RENT_OVERDUE','MAINTENANCE','REPORT_READY','SETTLEMENT','PAYMENT') NOT NULL,
  `channel`     ENUM('IN_APP','KAKAO','SMS') NOT NULL DEFAULT 'IN_APP',
  `title`       VARCHAR(191) NOT NULL,
  `body`        TEXT NULL,
  `refId`       VARCHAR(191) NULL,
  `readAt`      DATETIME(3) NULL,
  `sentMock`    BOOLEAN NOT NULL DEFAULT false,
  `createdAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `Notification_recipientId_createdAt_idx`(`recipientId`, `createdAt`),
  INDEX `Notification_type_idx`(`type`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Payment` (
  `id`           VARCHAR(191) NOT NULL,
  `payerId`      VARCHAR(191) NOT NULL,
  `type`         ENUM('SUBSCRIPTION','SETTLEMENT','RENT') NOT NULL,
  `refId`        VARCHAR(191) NOT NULL,
  `amount`       INT NOT NULL,
  `status`       ENUM('REQUESTED','PAID','FAILED','CANCELED') NOT NULL DEFAULT 'REQUESTED',
  `provider`     VARCHAR(191) NOT NULL DEFAULT 'mock',
  `mockChargeId` VARCHAR(191) NULL,
  `period`       VARCHAR(191) NULL,
  `paidAt`       DATETIME(3) NULL,
  `createdAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`    DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `Payment_payerId_idx`(`payerId`),
  INDEX `Payment_type_refId_idx`(`type`, `refId`),
  INDEX `Payment_status_idx`(`status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
