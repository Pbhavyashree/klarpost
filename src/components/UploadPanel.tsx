"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { LETTERS } from "../../eval/letters";

type Phase = { kind: "idle" } | { kind: "working"; message: string; fraction?: number } | { kind: "error"; message: string };

const SAMPLES = [
  { id: "tax-assessment", label: "Tax assessment" },
  { id: "broadcast-fee-assessment", label: "Broadcasting fee" },
  { id: "immigration-appointment", label: "Appointment invitation" },
  { id: "family-benefit-form", label: "Child benefit form" },
];

export function UploadPanel() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasted, setPasted] = useState("");
  const [receivedOn, setReceivedOn] = useState("");
  const busy = phase.kind === "working";

  async function submit(form: FormData) {
    if (receivedOn) form.set("receivedOn", receivedOn);
    setPhase({ kind: "working", message: "Hiding personal data and checking every deadline…" });
    const res = await fetch("/api/letters", { method: "POST", body: form });
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok || !body.id) throw new Error(body.error ?? "The letter couldn't be analysed.");
    router.push(`/letters/${body.id}`);
    router.refresh();
  }

  async function handleFile(file: File) {
    try {
      setPhase({ kind: "working", message: "Opening the letter…", fraction: 0.02 });
      const { readLetterFile } = await import("@/client/read-letter");
      const result = await readLetterFile(file, (message, fraction) => setPhase({ kind: "working", message, fraction }));
      if (result.document.text.trim().length < 20) {
        throw new Error("No text could be read. Try a sharper photo, taken straight on in good light.");
      }
      const form = new FormData();
      form.set("document", JSON.stringify(result.document));
      form.set("source", result.source);
      result.pages.forEach((blob, i) => form.set(`page-${i + 1}`, blob, `page-${i + 1}.jpg`));
      await submit(form);
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : "Something went wrong." });
    }
  }

  async function handleText(text: string) {
    try {
      const form = new FormData();
      form.set("text", text);
      await submit(form);
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : "Something went wrong." });
    }
  }

  return (
    <div className="envelope">
      {pasteMode ? (
        <form
          className="options"
          style={{ marginTop: 0 }}
          onSubmit={(e) => {
            e.preventDefault();
            void handleText(pasted);
          }}
        >
          <label htmlFor="pasted" className="small">Letter text</label>
          <textarea id="pasted" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste the full text of the letter here" />
          <div className="row">
            <button className="btn" disabled={busy || pasted.trim().length < 20}>Analyse letter</button>
            <button type="button" className="btn quiet" onClick={() => setPasteMode(false)}>Upload a file instead</button>
          </div>
        </form>
      ) : (
        <div
          className={`envelope-window ${dragging ? "dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f && !busy) void handleFile(f);
          }}
        >
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M8 14h32v22a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V14Z" fill="none" stroke="currentColor" strokeWidth="2.5" />
            <path d="m8 14 16 12 16-12" fill="none" stroke="currentColor" strokeWidth="2.5" />
            <path d="M24 4v12m0-12-5 5m5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <p>
            <strong>Drop a photo or PDF of the letter here</strong>
          </p>
          <div className="row" style={{ justifyContent: "center" }}>
            <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>
              Choose file or take photo
            </button>
            <button type="button" className="btn secondary" disabled={busy} onClick={() => setPasteMode(true)}>
              Paste text
            </button>
          </div>
          <input
            ref={input}
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void handleFile(f);
            }}
          />
        </div>
      )}

      <div className="options">
        <div className="received">
          <label htmlFor="received">Received on (optional)</label>
          <input id="received" type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
        </div>

        {phase.kind === "working" && (
          <div role="status" aria-live="polite" style={{ display: "grid", gap: 8 }}>
            <span>{phase.message}</span>
            <div className="progress" aria-hidden="true">
              <span style={{ width: `${Math.round((phase.fraction ?? 0.9) * 100)}%` }} />
            </div>
          </div>
        )}
        {phase.kind === "error" && (
          <p className="error" role="alert">
            {phase.message}
          </p>
        )}

        <div>
          <p className="small muted" style={{ marginBottom: 8 }}>No letter at hand? Try a fictional one:</p>
          <div className="samples">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                type="button"
                className="chip"
                disabled={busy}
                onClick={() => void handleText(LETTERS.find((l) => l.id === s.id)!.text)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="privacy-note">
        <svg viewBox="0 0 18 18" aria-hidden="true">
          <path d="M9 1.5 3 4v4.5c0 3.6 2.6 6.9 6 8 3.4-1.1 6-4.4 6-8V4L9 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        Text is read on your device. Names, addresses, IBANs and ID numbers are replaced with placeholders before anything is sent
        to the AI, and you can see exactly what it received.
      </p>
    </div>
  );
}
