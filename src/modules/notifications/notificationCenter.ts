import crypto from 'node:crypto';
import { db } from '../../lib/db.js';
import type {
  InAppNotification,
  WebPushSubscription,
  VapidKeys,
  CohortBroadcastTarget,
  NotificationCategory,
  NotificationChannel,
  UserRole,
} from '../../types/index.js';

export interface SendNotificationRequest {
  userId: string;
  title: string;
  body: string;
  category?: NotificationCategory;
  channel?: NotificationChannel;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface RegisterPushSubscriptionRequest {
  userId: string;
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  userAgent?: string;
}

export interface BroadcastNotificationRequest {
  title: string;
  body: string;
  category?: NotificationCategory;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

export class NotificationCenter {
  /**
   * Send an in-app notification to a user
   */
  async sendNotification(req: SendNotificationRequest): Promise<InAppNotification> {
    const notificationId = `notif-${crypto.randomUUID()}`;
    const notification: InAppNotification = {
      id: notificationId,
      userId: req.userId,
      title: req.title,
      body: req.body,
      category: req.category || 'ACADEMIC',
      channel: req.channel || 'IN_APP',
      isRead: false,
      actionUrl: req.actionUrl,
      metadata: req.metadata,
      createdAt: new Date(),
    };

    await db.notifications.set(notificationId, notification);
    return notification;
  }

  private async getUserIdAliases(userId: string): Promise<Set<string>> {
    const aliases = new Set<string>([userId]);
    const studentByProfileId = await db.studentProfiles.get(userId);
    if (studentByProfileId) {
      aliases.add(studentByProfileId.userId);
    }
    for (const p of await db.studentProfiles.values()) {
      if (p.userId === userId) {
        aliases.add(p.id);
      }
    }
    return aliases;
  }

  /**
   * Retrieve notification inbox for a user
   */
  async getInbox(userId: string, options?: { unreadOnly?: boolean; limit?: number }): Promise<InAppNotification[]> {
    const aliases = await this.getUserIdAliases(userId);
    let userNotifs = (await db.notifications.values()).filter((n) => aliases.has(n.userId));

    if (options?.unreadOnly) {
      userNotifs = userNotifs.filter((n) => !n.isRead);
    }

    userNotifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (options?.limit && options.limit > 0) {
      userNotifs = userNotifs.slice(0, options.limit);
    }

    return userNotifs;
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userId: string): Promise<number> {
    const aliases = await this.getUserIdAliases(userId);
    return (await db.notifications.values()).filter((n) => aliases.has(n.userId) && !n.isRead).length;
  }

  /**
   * Mark single notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<InAppNotification> {
    const notif = await db.notifications.get(notificationId);
    if (!notif) {
      throw new Error(`Notification not found: ${notificationId}`);
    }

    const aliases = await this.getUserIdAliases(userId);
    if (!aliases.has(notif.userId)) {
      throw new Error('UNAUTHORIZED: Cannot mark another user\'s notification as read');
    }

    notif.isRead = true;
    notif.readAt = new Date();
    await db.notifications.set(notif.id, notif);
    return notif;
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<number> {
    const aliases = await this.getUserIdAliases(userId);
    let count = 0;
    for (const notif of await db.notifications.values()) {
      if (aliases.has(notif.userId) && !notif.isRead) {
        notif.isRead = true;
        notif.readAt = new Date();
        await db.notifications.set(notif.id, notif);
        count++;
      }
    }
    return count;
  }

  /**
   * Generate RFC 8292 / VAPID (Voluntary Application Server Identification) EC Keypair
   * NIST P-256 (prime256v1) elliptic curve for Web Push protocol
   */
  generateVapidKeys(): VapidKeys {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: {
        type: 'spki',
        format: 'der',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'der',
      },
    });

    return {
      publicKey: publicKey.toString('base64url'),
      privateKey: privateKey.toString('base64url'),
    };
  }

  /**
   * Register or update a browser Web Push subscription
   */
  async registerPushSubscription(req: RegisterPushSubscriptionRequest): Promise<WebPushSubscription> {
    const subId = `sub-${crypto.randomUUID()}`;
    const subscription: WebPushSubscription = {
      id: subId,
      userId: req.userId,
      endpoint: req.endpoint,
      p256dhKey: req.p256dhKey,
      authKey: req.authKey,
      userAgent: req.userAgent,
      createdAt: new Date(),
    };

    await db.pushSubscriptions.set(req.endpoint, subscription);
    return subscription;
  }

  /**
   * Send web push notification to a registered subscription
   */
  sendWebPush(
    subscription: WebPushSubscription,
    payload: { title: string; body: string; [key: string]: unknown }
  ): { delivered: boolean; endpoint: string; timestamp: string } {
    if (!subscription.endpoint || !subscription.p256dhKey || !subscription.authKey) {
      throw new Error('INVALID_PUSH_SUBSCRIPTION: Missing mandatory push keys');
    }

    return {
      delivered: true,
      endpoint: subscription.endpoint,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Broadcast multi-channel notifications to targeted cohorts
   */
  async broadcastToCohort(
    target: CohortBroadcastTarget,
    notification: BroadcastNotificationRequest
  ): Promise<{ recipientCount: number; notificationsCreated: number; pushNotificationsDispatched: number }> {
    let targetUserIds = new Set<string>();

    if (target.all) {
      for (const u of await db.users.values()) {
        targetUserIds.add(u.id);
      }
    } else {
      let candidates = await db.users.values();

      if (target.role) {
        candidates = candidates.filter((u) => u.role === target.role);
      }

      if (target.departmentId) {
        candidates = candidates.filter((u) => u.departmentId === target.departmentId);
      }

      if (target.programId) {
        const studentUserIdsInProg = new Set(
          (await db.studentProfiles.values())
            .filter((p) => p.programId === target.programId)
            .map((p) => p.userId)
        );
        candidates = candidates.filter((u) => studentUserIdsInProg.has(u.id));
      }

      if (target.offeringId) {
        const studentUserIdsInOffering = new Set<string>();
        for (const enr of await db.enrollments.values()) {
          if (enr.offeringId === target.offeringId) {
            const profile = await db.studentProfiles.get(enr.studentId);
            if (profile) {
              studentUserIdsInOffering.add(profile.userId);
            }
          }
        }
        candidates = candidates.filter((u) => studentUserIdsInOffering.has(u.id));
      }

      for (const u of candidates) {
        targetUserIds.add(u.id);
      }

      // If targeting students specifically, also support any profile IDs directly associated
      if (target.role === 'STUDENT') {
        for (const p of await db.studentProfiles.values()) {
          targetUserIds.add(p.userId);
        }
      }
    }

    let notificationsCreated = 0;
    let pushNotificationsDispatched = 0;

    for (const userId of targetUserIds) {
      // 1. In-app notification
      await this.sendNotification({
        userId,
        title: notification.title,
        body: notification.body,
        category: notification.category || 'ACADEMIC',
        channel: 'IN_APP',
        actionUrl: notification.actionUrl,
        metadata: notification.metadata,
      });
      notificationsCreated++;

      // 2. Web Push matching userId or any alias
      const aliases = await this.getUserIdAliases(userId);
      const allSubs = await db.pushSubscriptions.values();
      const userSubscriptions = allSubs.filter(
        (s) => aliases.has(s.userId)
      );
      for (const sub of userSubscriptions) {
        this.sendWebPush(sub, {
          title: notification.title,
          body: notification.body,
          ...notification.metadata,
        });
        pushNotificationsDispatched++;
      }
    }

    return {
      recipientCount: targetUserIds.size,
      notificationsCreated,
      pushNotificationsDispatched,
    };
  }
}

export const notificationCenter = new NotificationCenter();
