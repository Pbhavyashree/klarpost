import Link from "next/link";
import { formatCents } from "@/core/amounts";
import { getDb } from "@/db/client";
import { UploadPanel } from "@/components/UploadPanel";
import { deDate, Stamp } from "@/components/Stamp";
import { isActionableDeadline, listLetters, openDeadlines } from "@/server/letters";
import { currentUserId } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const userId = await currentUserId();
  const db = await getDb();
  const [letters, deadlines] = userId ? await Promise.all([listLetters(db, userId), openDeadlines(db, userId)]) : [[], []];

  return (
    <>
      {deadlines.length > 0 && (
        <section className="deadlines" aria-labelledby="deadlines-title">
          <h2 id="deadlines-title">Coming up</h2>
          <div className="deadlines-row">
            {deadlines.slice(0, 8).map(({ item, letter }) => (
              <Link key={item.id} href={`/letters/${letter.id}#item-${item.id}`} className="deadline-card">
                <Stamp date={item.dueDate!} />
                <span className="what">{item.label}</span>
                <span className="from">{letter.sender ?? "Letter"}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="home-grid">
        <section aria-labelledby="add-title">
          <h1 id="add-title" style={{ marginBottom: 8 }}>What does this letter want from me?</h1>
          <p className="muted" style={{ marginBottom: 20 }}>
            Add a letter from an authority, insurer or landlord. You get a plain-English explanation, every deadline and amount
            marked on the original, and reminders on Telegram.
          </p>
          <UploadPanel />
        </section>

        <section aria-labelledby="letters-title">
          <h2 id="letters-title">Your letters</h2>
          {letters.length === 0 ? (
            <p className="empty" style={{ marginTop: 14 }}>
              No letters yet. Add one, or try a sample letter to see how it works.
            </p>
          ) : (
            <ul className="letter-list">
              {letters.map((l) => {
                const open = l.items.filter(isActionableDeadline).sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1));
                const review = l.items.some((i) => i.status === "needs_review" && i.userConfirmed === null);
                const amount = l.items.find((i) => i.kind === "amount" && i.status === "verified");
                return (
                  <li key={l.id}>
                    <Link href={`/letters/${l.id}`} className={`letter-row ${review ? "has-review" : open.length ? "has-open" : ""}`}>
                      <div>
                        <h3>{l.sender ?? "Untitled letter"}</h3>
                        <p className="meta">
                          {[l.letterType, l.letterDate ? `dated ${deDate(l.letterDate)}` : null, amount ? formatCents(amount.amountCents!) : null]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                        {review && <p className="small" style={{ color: "var(--marker-review-strong)", fontWeight: 700 }}>Something needs your review</p>}
                      </div>
                      {open[0] && <Stamp date={open[0].dueDate!} small />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
