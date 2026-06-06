-- AddColumn isCurator to User table (decouples Verified Curator badge from isAdmin)
ALTER TABLE "User" ADD COLUMN "isCurator" BOOLEAN NOT NULL DEFAULT false;
