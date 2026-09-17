const ADMIN_ID = "8423554712";
const SETUP_KEY = "abu-ali-setup-8423554712";

function tgUrl(token, method) {
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function tg(token, method, body) {
  const res = await fetch(tgUrl(token, method), {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify(body),
  });
  return await res.json();
}

function studentInfo(user, chatId) {
  const name = user?.first_name || user?.last_name
    ? [user?.first_name, user?.last_name].filter(Boolean).join(" ")
    : "غير معروف";
  const username = user?.username ? `@${user.username}` : "لا يوجد";
  return `📩 رسالة جديدة إلى أبو علي\n\n👤 الاسم: ${name}\n🔗 المستخدم: ${username}\n🆔 ID: ${chatId}\n\n↩️ رد على هذه الرسالة حتى يوصل ردك للطالب.\n\n[STUDENT_CHAT_ID:${chatId}]`;
}

function extractStudentId(text) {
  const m = text?.match(/\[STUDENT_CHAT_ID:(-?\d+)\]/);
  return m ? m[1] : null;
}

async function handleUpdate(update, env) {
  const token = env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN is not configured");

  const msg = update.message;
  if (!msg) return;

  if (String(msg.chat.id) === ADMIN_ID) {
    if (!msg.reply_to_message) return;
    const studentChatId = extractStudentId(msg.reply_to_message.text);
    if (!studentChatId) return;

    const result = await tg(token, "copyMessage", {
      chat_id: studentChatId,
      from_chat_id: ADMIN_ID,
      message_id: msg.message_id,
    });

    if (result.ok) {
      await tg(token, "sendMessage", {
        chat_id: ADMIN_ID,
        text: "✅ تم إرسال الرد للطالب.",
        reply_to_message_id: msg.message_id,
      });
    }
    return;
  }

  if (msg.text === "/start") {
    await tg(token, "sendMessage", {
      chat_id: msg.chat.id,
      text: "هلا بيك 🌷\nاكتب رسالتك هنا وراح توصله إلى أبو علي.",
    });
    return;
  }

  const studentChatId = msg.chat.id;
  const header = studentInfo(msg.from, studentChatId);

  const sent = await tg(token, "sendMessage", {
    chat_id: ADMIN_ID,
    text: header,
  });

  if (!sent.ok) throw new Error(JSON.stringify(sent));

  await tg(token, "copyMessage", {
    chat_id: ADMIN_ID,
    from_chat_id: studentChatId,
    message_id: msg.message_id,
  });

  await tg(token, "sendMessage", {
    chat_id: studentChatId,
    text: "✅ وصلت رسالتك إلى أبو علي.",
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET") {
      if (url.pathname === "/") {
        return new Response("Abu Ali Telegram Bot is running.");
      }

      if (url.pathname === "/set-webhook") {
        if (url.searchParams.get("key") !== SETUP_KEY) {
          return new Response("Unauthorized", {status: 401});
        }
        const result = await tg(env.BOT_TOKEN, "setWebhook", {
          url: `${url.origin}/telegram`,
          secret_token: env.WEBHOOK_SECRET || "abu-ali-webhook",
          allowed_updates: ["message"],
        });
        return Response.json(result);
      }

      return new Response("Not found", {status: 404});
    }

    if (request.method === "POST" && url.pathname === "/telegram") {
      const expected = env.WEBHOOK_SECRET || "abu-ali-webhook";
      const received = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (received !== expected) {
        return new Response("Unauthorized", {status: 401});
      }

      const update = await request.json();
      await handleUpdate(update, env);
      return new Response("OK");
    }

    return new Response("Method not allowed", {status: 405});
  }
};
