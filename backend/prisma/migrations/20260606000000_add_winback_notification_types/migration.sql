-- Migration: add_winback_notification_types
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WINBACK';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DEMAND_SURGE';
