/*
  Warnings:

  - Added the required column `type` to the `merchants` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "type" TEXT NOT NULL;
