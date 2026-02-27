/**
 * Telegram Bot — Handles invites, group management, and identity linking.
 *
 * Flow:
 *   1. Admin adds bot to channel/group via BotFather
 *   2. Bot generates unique invite links for users
 *   3. When user joins via invite link, bot captures their Telegram user ID
 *   4. User opens bchat app → "Connect Telegram" → bot verifies identity
 *   5. Bot links Telegram ID to bchat user account
 *
 * All state is persisted to PostgreSQL — no data lost on restart.
 */

import { Telegraf, Context } from 'telegraf';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/pool';
import {
  getTrustedRoomByTelegramChat,
  createTrustedRoom,
  deactivateTrustedRoom,
  getTrustedRoom,
} from '../trustedRooms/engine';

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
 * Create and configure the Telegram bot
 */
export function createBot(token: string): Telegraf {
  const bot = new Telegraf(token);

  // Track new members joining the channel/group — persisted to DB
  bot.on('chat_member', async (ctx) => {
    const update = ctx.chatMember;
    if (!update) return;

    const newStatus = update.new_chat_member.status;
    const user = update.new_chat_member.user;

    if (newStatus === 'member' || newStatus === 'administrator') {
      await query(
        `INSERT INTO telegram_join_events (telegram_user_id, username, first_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (telegram_user_id) DO UPDATE SET username = $2, first_name = $3, joined_at = NOW()`,
        [user.id, user.username || null, user.first_name]
      );
      console.log(`[Bot] User joined: ${user.id} (@${user.username || 'no_username'})`);

      // Check if this group is a trusted room
      try {
        const chatId = update.chat.id;
        const trustedRoom = await getTrustedRoomByTelegramChat(chatId);
        if (trustedRoom) {
          // Get the user's join timestamp from the event we just recorded
          const joinRecord = await query(
            'SELECT joined_at FROM telegram_join_events WHERE telegram_user_id = $1',
            [user.id]
          );
          const joinedAt = joinRecord.rows[0]?.joined_at;
          const cutoff = new Date(trustedRoom.membershipCutoff);

          if (joinedAt && new Date(joinedAt) < cutoff) {
            // Check member cap
            if (trustedRoom.maxMembers === 0 || trustedRoom.admittedCount < trustedRoom.maxMembers) {
              // Mark the join event with the trusted room synthetic invite code
              await query(
                `UPDATE telegram_join_events SET invite_code = $1
                 WHERE telegram_user_id = $2`,
                [`trusted::${trustedRoom.id}`, user.id]
              );
              console.log(`[Bot] User ${user.id} qualifies for trusted room "${trustedRoom.name}" (joined before cutoff)`);

              // Try to send a DM to the user
              try {
                await ctx.telegram.sendMessage(
                  user.id,
                  `You have auto-access to X Shield via the trusted group "${trustedRoom.name}"!\n\n` +
                  `Open the X Shield app and tap "Connect Telegram" to set up your account.\n` +
                  `No invite code needed.`
                );
              } catch {
                // DM may fail if user hasn't started the bot — that's OK
              }
            }
          } else {
            console.log(`[Bot] User ${user.id} joined after cutoff for trusted room "${trustedRoom.name}" — no auto-access`);
          }
        }
      } catch (err: any) {
        console.error(`[Bot] Trusted room check failed for user ${user.id}:`, err.message);
      }
    }
  });

  // /start command — entry point from invite links
  bot.start(async (ctx) => {
    const payload = ctx.startPayload; // deep link payload
    if (payload) {
      // Check if invite exists and hasn't been used
      const invite = await query(
        'SELECT * FROM invites WHERE code = $1 AND used_by IS NULL AND expires_at > NOW()',
        [payload]
      );

      if (invite.rows.length > 0) {
        // Mark the Telegram user on this invite
        await query(
          'UPDATE invites SET telegram_user_id = $1, used_at = NOW() WHERE code = $2',
          [ctx.from.id, payload]
        );

        // Also record the join event with the invite code
        await query(
          `INSERT INTO telegram_join_events (telegram_user_id, username, first_name, invite_code)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (telegram_user_id) DO UPDATE SET invite_code = $4, joined_at = NOW()`,
          [ctx.from.id, ctx.from.username || null, ctx.from.first_name, payload]
        );

        ctx.reply(
          `Welcome to X Shield! Your invite has been verified.\n\n` +
          `Open the X Shield app and tap "Connect Telegram" to complete setup.\n\n` +
          `Your verification code: ${payload}`
        );
        return;
      }
    }

    ctx.reply(
      `Welcome to X Shield!\n\n` +
      `If you have an invite code, ask the person who invited you for their link.\n` +
      `If you're already a member, open the X Shield app to connect your account.`
    );
  });

  // /invite command — admins generate invite codes (persisted to DB)
  bot.command('invite', async (ctx) => {
    const code = uuidv4().slice(0, 8);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Look up the bchat user by telegram ID for the created_by FK
    const user = await query(
      'SELECT id FROM users WHERE telegram_id = $1',
      [ctx.from.id]
    );

    await query(
      `INSERT INTO invites (code, created_by, expires_at)
       VALUES ($1, $2, $3)`,
      [code, user.rows[0]?.id || null, expiresAt]
    );

    const botInfo = await ctx.telegram.getMe();
    const inviteLink = `https://t.me/${botInfo.username}?start=${code}`;

    ctx.reply(
      `Invite created!\n\nShare this link:\n${inviteLink}\n\n` +
      `Code: ${code}\nExpires in 24 hours.`
    );
  });

  // /trustroom command — admins manage trusted room designation
  bot.command('trustroom', async (ctx) => {
    const args = ctx.message.text.split(/\s+/).slice(1);
    const subcommand = args[0]?.toLowerCase();

    // Look up calling user's bchat account
    const bchatUser = await query(
      "SELECT id, role FROM users WHERE telegram_id = $1",
      [ctx.from.id]
    );
    if (bchatUser.rows.length === 0 || !['admin', 'creator'].includes(bchatUser.rows[0].role)) {
      ctx.reply('Only bchat admins can use /trustroom.');
      return;
    }
    const adminId = bchatUser.rows[0].id;
    const chatId = ctx.chat.id;

    if (subcommand === 'enable') {
      const dateArg = args[1]; // YYYY-MM-DD
      if (!dateArg || !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
        ctx.reply(
          'Usage: /trustroom enable YYYY-MM-DD\n\n' +
          'The date is the membership cutoff — only members who joined this group BEFORE that date get auto-access.\n\n' +
          'Example: /trustroom enable 2026-02-25'
        );
        return;
      }

      const cutoff = new Date(dateArg + 'T23:59:59.999Z');
      if (isNaN(cutoff.getTime())) {
        ctx.reply('Invalid date. Use YYYY-MM-DD format.');
        return;
      }

      try {
        const existing = await getTrustedRoomByTelegramChat(chatId);
        if (existing) {
          ctx.reply(`This group is already a trusted room ("${existing.name}").`);
          return;
        }

        const chatInfo = await ctx.telegram.getChat(chatId);
        const chatTitle = ('title' in chatInfo ? chatInfo.title : null) || 'Untitled Group';

        const room = await createTrustedRoom(adminId, {
          sourceType: 'telegram',
          telegramChatId: chatId,
          name: chatTitle,
          membershipCutoff: cutoff.toISOString(),
        });

        ctx.reply(
          `Trusted room enabled!\n\n` +
          `Name: ${room.name}\n` +
          `Cutoff: ${dateArg} (only members who joined before this date get auto-access)\n` +
          `Trust score: ${room.defaultTrustScore}\n` +
          `Member cap: ${room.maxMembers === 0 ? 'Unlimited' : room.maxMembers}`
        );
      } catch (err: any) {
        ctx.reply(`Failed to enable trusted room: ${err.message}`);
      }

    } else if (subcommand === 'disable') {
      try {
        const room = await getTrustedRoomByTelegramChat(chatId);
        if (!room) {
          ctx.reply('This group is not a trusted room.');
          return;
        }

        await deactivateTrustedRoom(room.id, adminId, 'Disabled via /trustroom command');
        ctx.reply(`Trusted room "${room.name}" has been deactivated. No new auto-admissions.`);
      } catch (err: any) {
        ctx.reply(`Failed to disable: ${err.message}`);
      }

    } else if (subcommand === 'status') {
      try {
        const room = await query(
          'SELECT * FROM trusted_rooms WHERE telegram_chat_id = $1 ORDER BY created_at DESC LIMIT 1',
          [chatId]
        );
        if (room.rows.length === 0) {
          ctx.reply('This group is not a trusted room.');
          return;
        }
        const r = room.rows[0];
        const cutoffDate = new Date(r.membership_cutoff).toISOString().split('T')[0];
        ctx.reply(
          `Trusted Room: ${r.name}\n` +
          `Status: ${r.is_active ? 'Active' : 'Deactivated'}\n` +
          `Cutoff date: ${cutoffDate}\n` +
          `Admitted: ${r.admitted_count}${r.max_members > 0 ? ` / ${r.max_members}` : ''}\n` +
          `Trust score: ${parseFloat(r.default_trust_score).toFixed(2)}`
        );
      } catch (err: any) {
        ctx.reply(`Failed to get status: ${err.message}`);
      }

    } else {
      ctx.reply(
        'Usage:\n' +
        '/trustroom enable YYYY-MM-DD — Mark this group as trusted (date = membership cutoff)\n' +
        '/trustroom disable — Deactivate trusted room\n' +
        '/trustroom status — Show current status'
      );
    }
  });

  // /verify command — user requests verification status
  bot.command('verify', async (ctx) => {
    const userId = ctx.from.id;
    const joinEvent = await query(
      'SELECT * FROM telegram_join_events WHERE telegram_user_id = $1',
      [userId]
    );

    if (joinEvent.rows.length > 0) {
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
export async function getInvite(code: string): Promise<InviteRecord | undefined> {
  const result = await query(
    'SELECT * FROM invites WHERE code = $1 AND expires_at > NOW()',
    [code]
  );
  if (result.rows.length === 0) return undefined;
  const row = result.rows[0];
  return {
    code: row.code,
    telegramUserId: row.telegram_user_id,
    createdAt: row.created_at,
    usedAt: row.used_at,
    createdBy: row.created_by,
  };
}

/**
 * Look up a join event by Telegram user ID
 */
export async function getJoinEvent(telegramUserId: number): Promise<TelegramJoinEvent | undefined> {
  const result = await query(
    'SELECT * FROM telegram_join_events WHERE telegram_user_id = $1',
    [telegramUserId]
  );
  if (result.rows.length === 0) return undefined;
  const row = result.rows[0];
  return {
    userId: row.telegram_user_id,
    username: row.username,
    firstName: row.first_name,
    joinedAt: row.joined_at,
    inviteCode: row.invite_code,
  };
}

/**
 * Record a join event manually (e.g., from webhook data)
 */
export async function recordJoinEvent(event: TelegramJoinEvent): Promise<void> {
  await query(
    `INSERT INTO telegram_join_events (telegram_user_id, username, first_name, invite_code)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telegram_user_id) DO UPDATE SET username = $2, first_name = $3, joined_at = NOW()`,
    [event.userId, event.username || null, event.firstName, event.inviteCode || null]
  );
}
