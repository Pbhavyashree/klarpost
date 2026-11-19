"use client";

import { useEffect, useRef, useState } from "react";

const STATES: [string, string][] = [
  ["BW", "Baden-Württemberg"], ["BY", "Bayern"], ["BE", "Berlin"], ["BB", "Brandenburg"], ["HB", "Bremen"], ["HH", "Hamburg"],
  ["HE", "Hessen"], ["MV", "Mecklenburg-Vorpommern"], ["NI", "Niedersachsen"], ["NW", "Nordrhein-Westfalen"], ["RP", "Rheinland-Pfalz"],
  ["SL", "Saarland"], ["SN", "Sachsen"], ["ST", "Sachsen-Anhalt"], ["SH", "Schleswig-Holstein"], ["TH", "Thüringen"],
];
const DAY_OPTIONS = [14, 7, 3, 1];

interface Props {
  telegramAvailable: boolean;
  initial: { linked: boolean; username: string | null; state: string; reminderDays: number[] };
}

export function SettingsForm({ telegramAvailable, initial }: Props) {
  const [linked, setLinked] = useState(initial.linked);
  const [username, setUsername] = useState(initial.username);
  const [waiting, setWaiting] = useState(false);
  const [state, setState] = useState(initial.state);
  const [days, setDays] = useState(initial.reminderDays);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  async function connect() {
    setMessage(null);
    const res = await fetch("/api/telegram/link", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !body.url) return setMessage(body.error ?? "Couldn't create a link.");
    window.open(body.url, "_blank", "noopener");
    setWaiting(true);
    const started = Date.now();
    timer.current = setInterval(async () => {
      const s = (await (await fetch("/api/telegram/link")).json()) as { linked: boolean; username: string | null };
      if (s.linked || Date.now() - started > 15 * 60 * 1000) {
        clearInterval(timer.current!);
        setWaiting(false);
        setLinked(s.linked);
        setUsername(s.username);
      }
    }, 3000);
  }

  async function disconnect() {
    await fetch("/api/telegram/link", { method: "DELETE" });
    setLinked(false);
    setUsername(null);
  }

  async function save(patch: { state?: string; reminderDays?: number[] }) {
    const res = await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    setMessage(res.ok ? "Saved." : "Couldn't save the setting.");
  }

  return (
    <>
      <section className="card">
        <h2>Telegram</h2>
        {!telegramAvailable ? (
          <p className="muted">Telegram reminders aren't set up on this server yet (TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME are missing).</p>
        ) : linked ? (
          <>
            <p>
              <span className="status-dot on" />
              Connected{username ? ` as @${username}` : ""}. Reminders go to this chat.
            </p>
            <div>
              <button className="btn secondary" onClick={disconnect}>
                Disconnect Telegram
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              <span className="status-dot" />
              Not connected.
            </p>
            <div>
              <button className="btn" onClick={connect} disabled={waiting}>
                Connect Telegram
              </button>
            </div>
            {waiting && (
              <p className="small muted" role="status">
                Telegram opened in a new tab. Press <strong>Start</strong> in the chat with the bot; this page updates once you're connected.
              </p>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h2>When to remind me</h2>
        <p className="small muted">You always get a message on the day itself.</p>
        <div className="chips" role="group" aria-label="Days before the deadline">
          {DAY_OPTIONS.map((d) => {
            const on = days.includes(d);
            return (
              <button
                key={d}
                className="chip"
                aria-pressed={on}
                onClick={() => {
                  const next = on ? days.filter((x) => x !== d) : [...days, d];
                  setDays(next);
                  void save({ reminderDays: next });
                }}
              >
                {d === 1 ? "1 day before" : `${d} days before`}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>Your federal state</h2>
        <p className="small muted">Public holidays differ by state and can move a deadline to the next working day.</p>
        <select
          aria-label="Federal state"
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            void save({ state: e.target.value });
          }}
        >
          {STATES.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </section>
      {message && (
        <p className="small muted" role="status">
          {message}
        </p>
      )}
    </>
  );
}
