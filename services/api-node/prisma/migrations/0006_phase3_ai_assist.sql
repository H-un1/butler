-- Phase 3 (M5) — AI 보조 (전부 mock): ChatbotLog · OcrDocument
-- ⚠️ 챗봇/OCR/판례는 mock(외부 모델 호출 0). 주민번호 등 고유식별정보는 저장하지 않는다.
--    OcrDocument는 마스킹된 소유자 표기/요약만 보관(주민번호 평문 컬럼 없음).

CREATE TABLE `ChatbotLog` (
  `id`        VARCHAR(191) NOT NULL,
  `userId`    VARCHAR(191) NOT NULL,
  `question`  TEXT NOT NULL,
  `answer`    TEXT NOT NULL,
  `topic`     ENUM('LEASE_LAW','TAX','GENERAL') NOT NULL,
  `mock`      BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ChatbotLog_userId_createdAt_idx`(`userId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OcrDocument` (
  `id`           VARCHAR(191) NOT NULL,
  `userId`       VARCHAR(191) NOT NULL,
  `address`      VARCHAR(191) NOT NULL,
  `ownerMasked`  VARCHAR(191) NOT NULL,
  `safetyGrade`  ENUM('SAFE','CAUTION','DANGER') NOT NULL,
  `safetyReason` TEXT NOT NULL,
  `totalDebt`    INT NOT NULL DEFAULT 0,
  `marketPrice`  INT NULL,
  `result`       JSON NOT NULL,
  `mock`         BOOLEAN NOT NULL DEFAULT true,
  `createdAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `OcrDocument_userId_createdAt_idx`(`userId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
