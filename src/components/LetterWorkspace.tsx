"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { formatCents } from "@/core/amounts";
import type { LetterDocument } from "@/core/types";
import type { ItemRow } from "@/server/letters";
import { Stamp } from "./Stamp";

interface Props {
  letter: {
    id: string;
    summary: string;
    letterDate: string | null;
    receivedOn: string | null;
    source: string;
    extractor: string;
    document: LetterDocument;
    sentToModel: string;
    redactions: { kind: string; placeholder: string }[];
    pages: number[];
    items: ItemRow[];
  };
}

const GROUPS: { kind: string; title: string }[] = [
  { kind: "deadline", title: "Deadlines" },
  { kind: "amount", title: "Amounts" },
  { kind: "action", title: "What to do" },
  { kind: "reference", title: "Quote these in your reply" },
];

const isReview = (i: ItemRow) => i.status === "needs_review" && i.userConfirmed !== true;

function scrollAndFlash(selector: string) {
  const els = document.querySelectorAll<HTMLElement>(selector);
  if (!els.length) return;
  els[0]!.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  els.forEach((el) => {
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
  });
}

export function LetterWorkspace({ letter }: Props) {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);
  const [view, setView] = useState<"original" | "text" | "ai">(letter.pages.length ? "original" : "text");
  const [items, setItems] = useState(letter.items);
  const [receivedOn, setReceivedOn] = useState(letter.receivedOn ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setItems(letter.items), [letter.items]);
  useEffect(() => {
    const hash = window.location.hash.replace("#item-", "");
    if (hash) {
      setActive(hash);
      setTimeout(() => scrollAndFlash(`[data-item="${hash}"]`), 300);
    }
  }, []);

  const highlighted = items.filter((i) => i.sourceSpan && i.userConfirmed !== false);

  function select(id: string, from: "list" | "letter") {
    setActive(id);
    if (from === "list") scrollAndFlash(`[data-mark="${id}"]`);
    else scrollAndFlash(`[data-item="${id}"]`);
  }

  async function patchItem(id: string, body: { userConfirmed?: boolean | null; done?: boolean }) {
    setError(null);
    const res = await fetch(`/api/items/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return setError("That change couldn't be saved. Try again.");
    const row = (await res.json()) as ItemRow;
    setItems((prev) => prev.map((i) => (i.id === id ? row : i)));
    router.refresh();
  }

  async function saveReceived(value: string | null) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/letters/${letter.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ receivedOn: value }),
    });
    setSaving(false);
    if (!res.ok) return setError("The date couldn't be saved.");
    router.refresh();
  }

  async function remove() {
    if (!confirm("Delete this letter and its reminders? This can't be undone.")) return;
    const res = await fetch(`/api/letters/${letter.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else setError("The letter couldn't be deleted.");
  }

  const hasRelative = items.some((i) => i.relative);

  return (
    <div className="workspace">
      <section aria-label="The letter">
        <div className="sheet-toolbar">
          <div className="chips" role="group" aria-label="Show">
            {letter.pages.length > 0 && (
              <button className="chip" aria-pressed={view === "original"} onClick={() => setView("original")}>
                Original
              </button>
            )}
            <button className="chip" aria-pressed={view === "text"} onClick={() => setView("text")}>
              Text
            </button>
            <button className="chip" aria-pressed={view === "ai"} onClick={() => setView("ai")}>
              What the AI saw
            </button>
          </div>
          <span className="small muted">
            <Swatch review={false} /> checked <Swatch review /> needs review
          </span>
        </div>
        <div className="sheet">
          {view === "original" && <PageImages letterId={letter.id} pages={letter.pages} document={letter.document} items={highlighted} active={active} onSelect={(id) => select(id, "letter")} />}
          {view === "text" && <MarkedText text={letter.document.text} items={highlighted} active={active} onSelect={(id) => select(id, "letter")} />}
          {view === "ai" && <AiView text={letter.sentToModel} count={letter.redactions.length} />}
        </div>
      </section>

      <aside className="panel" aria-label="What this letter means">
        <section>
          <h2 style={{ marginBottom: 8 }}>In plain English</h2>
          <p className="summary">{letter.summary}</p>
        </section>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {GROUPS.map(({ kind, title }) => {
          const group = items.filter((i) => i.kind === kind);
          if (!group.length) return null;
          return (
            <section key={kind}>
              <div className="group-title">
                <h2>{title}</h2>
              </div>
              <ul className="items">
                {group.map((item) => (
                  <ItemCard key={item.id} item={item} active={active === item.id} onSelect={() => select(item.id, "list")} onPatch={(b) => patchItem(item.id, b)} />
                ))}
              </ul>
            </section>
          );
        })}

        {hasRelative && (
          <section className="card">
            <h3>When did the letter arrive?</h3>
            <p className="small muted">
              Periods like “within one month” start when you received the letter. Without a date, the legal default is used:
              4 days after the date on the letter.
            </p>
            <div className="received">
              <input type="date" aria-label="Date received" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
              <button className="btn" disabled={saving || !receivedOn || receivedOn === letter.receivedOn} onClick={() => saveReceived(receivedOn)}>
                Recalculate deadlines
              </button>
              {letter.receivedOn && (
                <button className="btn quiet" disabled={saving} onClick={() => { setReceivedOn(""); void saveReceived(null); }}>
                  Use the legal default
                </button>
              )}
            </div>
          </section>
        )}

        <p className="disclaimer">
          Klarpost explains letters; it is not legal or tax advice. For objections or anything with legal consequences, check
          with an advice centre or lawyer. Analysed with {letter.extractor.startsWith("anthropic") ? "an AI model" : "the offline rules engine"}.
        </p>
        <div>
          <button className="btn danger" onClick={remove}>
            Delete letter
          </button>
        </div>
      </aside>
    </div>
  );
}

function Swatch({ review }: { review: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, verticalAlign: "-1px", marginLeft: 8, background: review ? "var(--marker-review)" : "var(--marker)" }}
    />
  );
}

function ItemCard({ item, active, onSelect, onPatch }: { item: ItemRow; active: boolean; onSelect: () => void; onPatch: (b: { userConfirmed?: boolean | null; done?: boolean }) => void }) {
  const review = isReview(item);
  const dismissed = item.userConfirmed === false;
  const value =
    item.kind === "amount" && item.amountCents != null
      ? formatCents(item.amountCents, item.currency ?? "EUR")
      : item.kind === "reference" || item.kind === "action"
        ? item.text
        : null;

  return (
    <li
      id={`item-${item.id}`}
      data-item={item.id}
      className={`item ${review ? "review" : ""} ${active ? "active" : ""} ${dismissed ? "dismissed" : ""}`}
      onClick={onSelect}
    >
      <div className="item-top">
        <div>
          <h3>{item.label}</h3>
          {value && <p className="item-value">{value}</p>}
        </div>
        {item.kind === "deadline" && item.dueDate ? (
          <Stamp date={item.dueDate} small done={!!item.doneAt} word={item.label === "Appointment" ? "Termin" : "Frist"} />
        ) : null}
      </div>

      <p className="item-quote">“{item.quote}”</p>

      <p className={`badge ${review ? "review" : "verified"}`}>
        {dismissed ? "Dismissed by you" : review ? "Needs your review" : item.userConfirmed ? "Confirmed by you" : "Checked against the letter"}
      </p>

      {review && !dismissed && item.issues.length > 0 && (
        <ul className="issues">
          {item.issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}

      {item.dueDateExplanation && item.dueDateExplanation.length > 1 && (
        <details className="explain" onClick={(e) => e.stopPropagation()}>
          <summary>How this date was calculated</summary>
          <ol>
            {item.dueDateExplanation.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </details>
      )}

      <div className="item-actions" onClick={(e) => e.stopPropagation()}>
        {review && !dismissed && (
          <>
            <button className="btn secondary" onClick={() => onPatch({ userConfirmed: true })}>
              It's correct
            </button>
            <button className="btn quiet" onClick={() => onPatch({ userConfirmed: false })}>
              Dismiss
            </button>
          </>
        )}
        {dismissed && (
          <button className="btn quiet" onClick={() => onPatch({ userConfirmed: null })}>
            Undo dismiss
          </button>
        )}
        {item.kind === "deadline" && item.dueDate && !review && !dismissed && (
          <button className="btn secondary" onClick={() => onPatch({ done: !item.doneAt })}>
            {item.doneAt ? "Mark as not done" : "Mark as done"}
          </button>
        )}
      </div>
    </li>
  );
}

function MarkedText({ text, items, active, onSelect }: { text: string; items: ItemRow[]; active: string | null; onSelect: (id: string) => void }) {
  const segments = useMemo(() => {
    const points = new Set([0, text.length]);
    for (const i of items) {
      points.add(i.sourceSpan!.start);
      points.add(i.sourceSpan!.end);
    }
    const sorted = [...points].sort((a, b) => a - b);
    return sorted.slice(0, -1).map((start, k) => {
      const end = sorted[k + 1]!;
      const covering = items.filter((i) => i.sourceSpan!.start <= start && i.sourceSpan!.end >= end);
      return { start, end, covering };
    });
  }, [text, items]);

  return (
    <pre className="letter-text">
      {segments.map(({ start, end, covering }) => {
        const chunk = text.slice(start, end);
        if (!covering.length) return <Fragment key={start}>{chunk}</Fragment>;
        const top = covering.find((c) => c.id === active) ?? covering[0]!;
        return (
          <mark
            key={start}
            data-mark={top.id}
            className={`${isReview(top) ? "review" : ""} ${covering.some((c) => c.id === active) ? "active" : ""}`}
            onClick={() => onSelect(top.id)}
          >
            {chunk}
          </mark>
        );
      })}
    </pre>
  );
}

function PageImages({ letterId, pages, document: doc, items, active, onSelect }: { letterId: string; pages: number[]; document: LetterDocument; items: ItemRow[]; active: string | null; onSelect: (id: string) => void }) {
  return (
    <>
      {pages.map((page) => {
        const info = doc.pages.find((p) => p.page === page);
        if (!info) return null;
        return (
          <div key={page} className="page-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/letters/${letterId}/pages/${page}`} alt={`Page ${page} of the letter`} />
            {items.flatMap((item) =>
              item.sourceSpan!.boxes
                .filter((b) => b.page === page)
                .map((b, k) => (
                  <button
                    key={`${item.id}-${k}`}
                    data-mark={item.id}
                    aria-label={`${item.label}: ${item.quote}`}
                    className={`page-box ${isReview(item) ? "review" : ""} ${active === item.id ? "active" : ""}`}
                    style={{
                      left: `${(b.bbox.x0 / info.width) * 100 - 0.3}%`,
                      top: `${(b.bbox.y0 / info.height) * 100 - 0.2}%`,
                      width: `${((b.bbox.x1 - b.bbox.x0) / info.width) * 100 + 0.6}%`,
                      height: `${((b.bbox.y1 - b.bbox.y0) / info.height) * 100 + 0.4}%`,
                      border: "none",
                    }}
                    onClick={() => onSelect(item.id)}
                  />
                )),
            )}
          </div>
        );
      })}
    </>
  );
}

function AiView({ text, count }: { text: string; count: number }) {
  const parts = text.split(/(\[(?:IBAN|BIC|EMAIL|PHONE|NAME|ADDRESS|TAX_ID|BIRTH_DATE)_\d+\])/g);
  return (
    <>
      <p className="small muted" style={{ marginBottom: 16 }}>
        This is exactly what was sent for analysis. {count} piece{count === 1 ? "" : "s"} of personal data stayed on the server.
      </p>
      <pre className="letter-text">
        {parts.map((p, k) =>
          k % 2 === 1 ? (
            <span key={k} className="redacted">
              {p.slice(1, -1).replace(/_/g, " ").toLowerCase()}
            </span>
          ) : (
            <Fragment key={k}>{p}</Fragment>
          ),
        )}
      </pre>
    </>
  );
}

