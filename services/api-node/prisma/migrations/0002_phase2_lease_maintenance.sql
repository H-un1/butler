-- Phase 2 (M1) — Lease·MaintenanceRequest·MaintenanceComment 추가 + Role enum에 TENANT
-- 02_DATA_MODEL.md의 Phase 2 엔티티(Lease, MaintenanceRequest)를 활성화한다.
-- MaintenanceComment는 "수선요청 이슈 협업보드의 이력 아카이빙"을 위한 부속 테이블.
-- prisma migrate가 생성하는 DDL과 동치이며, 스키마 변경을 명시적으로 남기기 위한 문서.

-- Role enum에 TENANT 추가 (MySQL은 enum 컬럼 ALTER)
ALTER TABLE `User`
  MODIFY `role` ENUM('LANDLORD','INSPECTOR','ADMIN','TENANT') NOT NULL;

CREATE TABLE `Lease` (
  `id`           VARCHAR(191) NOT NULL,
  `propertyId`   VARCHAR(191) NOT NULL,
  `landlordId`   VARCHAR(191) NOT NULL,
  `tenantId`     VARCHAR(191) NULL,
  `status`       ENUM('PENDING','ACTIVE','ENDED') NOT NULL DEFAULT 'PENDING',
  `deposit`      BIGINT NOT NULL,
  `rent`         INT NULL,
  `startAt`      DATETIME(3) NOT NULL,
  `endAt`        DATETIME(3) NOT NULL,
  `inviteToken`  VARCHAR(191) NULL,
  `invitedPhone` VARCHAR(191) NULL,
  `createdAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`    DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `Lease_inviteToken_key`(`inviteToken`),
  INDEX `Lease_propertyId_idx`(`propertyId`),
  INDEX `Lease_landlordId_idx`(`landlordId`),
  INDEX `Lease_tenantId_idx`(`tenantId`),
  CONSTRAINT `Lease_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `Property`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Lease_landlordId_fkey` FOREIGN KEY (`landlordId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Lease_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MaintenanceRequest` (
  `id`          VARCHAR(191) NOT NULL,
  `propertyId`  VARCHAR(191) NOT NULL,
  `leaseId`     VARCHAR(191) NULL,
  `requesterId` VARCHAR(191) NOT NULL,
  `category`    ENUM('PLUMBING','ELECTRICAL','APPLIANCE','STRUCTURAL','ETC') NOT NULL,
  `title`       VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `status`      ENUM('OPEN','IN_PROGRESS','RESOLVED','CLOSED','REJECTED') NOT NULL DEFAULT 'OPEN',
  `photoUrls`   JSON NULL,
  `createdAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`   DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `MaintenanceRequest_propertyId_idx`(`propertyId`),
  INDEX `MaintenanceRequest_leaseId_idx`(`leaseId`),
  INDEX `MaintenanceRequest_requesterId_idx`(`requesterId`),
  INDEX `MaintenanceRequest_status_idx`(`status`),
  CONSTRAINT `MaintenanceRequest_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `Property`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `MaintenanceRequest_leaseId_fkey` FOREIGN KEY (`leaseId`) REFERENCES `Lease`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `MaintenanceRequest_requesterId_fkey` FOREIGN KEY (`requesterId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MaintenanceComment` (
  `id`          VARCHAR(191) NOT NULL,
  `requestId`   VARCHAR(191) NOT NULL,
  `authorId`    VARCHAR(191) NOT NULL,
  `body`        TEXT NOT NULL,
  `systemEvent` BOOLEAN NOT NULL DEFAULT false,
  `createdAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `MaintenanceComment_requestId_createdAt_idx`(`requestId`, `createdAt`),
  CONSTRAINT `MaintenanceComment_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `MaintenanceRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `MaintenanceComment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
