/*
  Warnings:

  - Added the required column `systemId` to the `RefreshToken` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "systemId" TEXT NOT NULL;
