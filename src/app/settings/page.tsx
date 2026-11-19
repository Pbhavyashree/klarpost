import { getDb } from "@/db/client";
import { SettingsForm } from "@/components/SettingsForm";
import { getUser } from "@/server/letters";
import { currentUserId } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await currentUserId();
  const user = userId ? await getUser(await getDb(), userId) : null;
  return (
    <div className="settings">
      <div>
        <h1 style={{ marginBottom: 8 }}>Reminders</h1>
        <p className="muted">Get a Telegram message before each deadline, with a button to mark it done.</p>
      </div>
      <SettingsForm
        telegramAvailable={!!process.env.TELEGRAM_BOT_USERNAME}
        initial={{
          linked: !!user?.telegramChatId,
          username: user?.telegramUsername ?? null,
          state: user?.state ?? "BE",
          reminderDays: user?.reminderDays ?? [7, 3, 1],
        }}
      />
    </div>
  );
}
