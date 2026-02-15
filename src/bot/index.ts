/**
 * Telegram Bot — Handles invites, group management, and identity linking.
 *
 * Flow:
 *   1. Admin adds bot to channel/group via BotFather
 *   2. Bot generates unique invite links for users
 *   3. When user joins via invite link, bot captures their Telegram user ID
 *   4. User opens bchat app → "Connect Telegram" → bot verifies identity
 *   5. Bot links Telegram ID to bchat user account
 */

import { Telegraf, Context } from 'telegraf';
import { v4 as uuidv4 } from 'uuid';

export interface InviteRecord {
  code: string;
  telegramUserId?: number;
  telegramUsername?: string;
  createdAt: Date;
  usedAt?: Date;
  createdBy: string; // admin who created the invite
}

export interface TelegramJoinEvent {
  userId: number;
  username?: string;
  firstName: string;
  joinedAt: Date;
  inviteCode?: string;
}

/**
 * In-memory stores (replace with DB in production)
 */
const pendingInvites = new Map<string, InviteRecord>();
const joinEvents = new Map<number, TelegramJoinEvent>(); // telegramUserId -> join event

/**
 * Create and configure the Telegram bot
 */
export function createBot(token: string): Telegraf {
  const bot = new Telegraf(token);

  // Track new members joining the channel/group
  bot.on('chat_member', (ctx) => {
    const update = ctx.chatMember;
    if (!update) return;

    const newStatus = update.new_chat_member.status;
    const user = update.new_chat_member.user;

    if (newStatus === 'member' || newStatus === 'administrator') {
      const event: TelegramJoinEvent = {
        userId: user.id,
        username: user.username,
        firstName: user.first_name,
        joinedAt: new Date(),
      };
      joinEvents.set(user.id, event);
      console.log(`[Bot] User joined: ${user.id} (@${user.username || 'no_username'})`);
    }
  });

  // /start command — entry point from invite links
  bot.start((ctx) => {
    const payload = ctx.startPayload; // deep link payload
    if (payload && pendingInvites.has(payload)) {
      const invite = pendingInvites.get(payload)!;
      invite.telegramUserId = ctx.from.id;
      invite.telegramUsername = ctx.from.username;
      invite.usedAt = new Date();

      ctx.reply(
        `Welcome to bchat! Your invite has been verified.\n\n` +
        `Open the bchat app and tap "Connect Telegram" to complete setup.\n\n` +
        `Your verification code: ${payload}`
      );
    } else {
      ctx.reply(
        `Welcome to bchat!\n\n` +
        `If you have an invite code, ask the person who invited you for their link.\n` +
        `If you're already a member, open the bchat app to connect your account.`
      );
    }
  });

  // /invite command — admins generate invite codes
  bot.command('invite', async (ctx) => {
    const code = uuidv4().slice(0, 8);
    const invite: InviteRecord = {
      code,
      createdAt: new Date(),
      createdBy: String(ctx.from.id),
    };
    pendingInvites.set(code, invite);

    const botInfo = await ctx.telegram.getMe();
    const inviteLink = `https://t.me/${botInfo.username}?start=${code}`;

    ctx.reply(
      `Invite created!\n\nShare this link:\n${inviteLink}\n\n` +
      `Code: ${code}\nExpires in 24 hours.`
    );

    // Auto-expire after 24h
    setTimeout(() => pendingInvites.delete(code), 24 * 60 * 60 * 1000);
  });

  // /verify command — user requests verification status
  bot.command('verify', (ctx) => {
    const userId = ctx.from.id;
    const joinEvent = joinEvents.get(userId);
    if (joinEvent) {
      ctx.reply(
        `Your Telegram ID (${userId}) has been recorded.\n` +
        `Open the bchat app and connect your account to complete verification.`
      );
    } else {
      ctx.reply(
        `We don't have a join record for your account.\n` +
        `Make sure you joined via an official invite link.`
      );
    }
  });

  return bot;
}

/**
 * Look up a pending invite by code
 */
export function getInvite(code: string): InviteRecord | undefined {
  return pendingInvites.get(code);
}

/**
 * Look up a join event by Telegram user ID
 */
export function getJoinEvent(telegramUserId: number): TelegramJoinEvent | undefined {
  return joinEvents.get(telegramUserId);
}

/**
 * Record a join event manually (e.g., from webhook data)
 */
export function recordJoinEvent(event: TelegramJoinEvent): void {
  joinEvents.set(event.userId, event);
}
