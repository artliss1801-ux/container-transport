import { db } from "./db";

export async function createNotification(data: { userId: string; type: string; title: string; message?: string; data?: any }) {
  try {
    return await db.notification.create({ data });
  } catch (err) {
    console.error("[notification-service] Error:", err);
  }
}

export async function createNotificationsBatch(items: { userId: string; type: string; title: string; message?: string; data?: any }[]) {
  try {
    await db.notification.createMany({ data: items });
  } catch (err) {
    console.error("[notification-service] Batch error:", err);
  }
}

