-- Phase 3 (M4) — 단지 커뮤니티 · 전자투표 · 보수업체
-- 커뮤니티/투표는 단지(complexName) 단위 폐쇄형 (실소유주/거주자 게이트는 서비스 레이어).

CREATE TABLE `CommunityPost` (
  `id`          VARCHAR(191) NOT NULL,
  `complexName` VARCHAR(191) NOT NULL,
  `authorId`    VARCHAR(191) NOT NULL,
  `title`       VARCHAR(191) NOT NULL,
  `body`        TEXT NOT NULL,
  `createdAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `CommunityPost_complexName_createdAt_idx`(`complexName`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PostComment` (
  `id`        VARCHAR(191) NOT NULL,
  `postId`    VARCHAR(191) NOT NULL,
  `authorId`  VARCHAR(191) NOT NULL,
  `body`      TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `PostComment_postId_createdAt_idx`(`postId`, `createdAt`),
  CONSTRAINT `PostComment_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `CommunityPost`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Vote` (
  `id`          VARCHAR(191) NOT NULL,
  `complexName` VARCHAR(191) NOT NULL,
  `creatorId`   VARCHAR(191) NOT NULL,
  `title`       VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `options`     JSON NOT NULL,
  `status`      ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
  `closesAt`    DATETIME(3) NULL,
  `createdAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `Vote_complexName_createdAt_idx`(`complexName`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Ballot` (
  `id`          VARCHAR(191) NOT NULL,
  `voteId`      VARCHAR(191) NOT NULL,
  `voterId`     VARCHAR(191) NOT NULL,
  `optionIndex` INT NOT NULL,
  `createdAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `Ballot_voteId_voterId_key`(`voteId`, `voterId`),
  INDEX `Ballot_voteId_idx`(`voteId`),
  CONSTRAINT `Ballot_voteId_fkey` FOREIGN KEY (`voteId`) REFERENCES `Vote`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Vendor` (
  `id`          VARCHAR(191) NOT NULL,
  `name`        VARCHAR(191) NOT NULL,
  `category`    ENUM('PLUMBING','ELECTRICAL','APPLIANCE','STRUCTURAL','ETC') NOT NULL,
  `region`      VARCHAR(191) NOT NULL,
  `phone`       VARCHAR(191) NULL,
  `description` TEXT NULL,
  `createdAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `Vendor_category_region_idx`(`category`, `region`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VendorReview` (
  `id`        VARCHAR(191) NOT NULL,
  `vendorId`  VARCHAR(191) NOT NULL,
  `authorId`  VARCHAR(191) NOT NULL,
  `rating`    INT NOT NULL,
  `comment`   TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `VendorReview_vendorId_authorId_key`(`vendorId`, `authorId`),
  INDEX `VendorReview_vendorId_idx`(`vendorId`),
  CONSTRAINT `VendorReview_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
