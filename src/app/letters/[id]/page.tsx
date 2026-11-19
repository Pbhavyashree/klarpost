import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { LetterWorkspace } from "@/components/LetterWorkspace";
import { deDate } from "@/components/Stamp";
import { Uuid } from "@/server/http";
import { getLetter } from "@/server/letters";
import { currentUserId } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function LetterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId || !Uuid.safeParse(id).success) notFound();
  const letter = await getLetter(await getDb(), userId, id);
  if (!letter) notFound();

  return (
    <>
      <Link href="/" className="back">
        ← All letters
      </Link>
      <div className="letter-head">
        <div>
          <h1>{letter.sender ?? "Untitled letter"}</h1>
          <p className="sub">
            {[letter.letterType, letter.letterDate ? `Dated ${deDate(letter.letterDate)}` : "Date not found"].filter(Boolean).join(". ")}
          </p>
        </div>
      </div>
      <LetterWorkspace
        letter={{
          id: letter.id,
          summary: letter.summary,
          letterDate: letter.letterDate,
          receivedOn: letter.receivedOn,
          source: letter.source,
          extractor: letter.extractor,
          document: letter.document,
          sentToModel: letter.sentToModel,
          redactions: letter.redactions,
          pages: letter.pages.map((p) => p.page),
          items: letter.items,
        }}
      />
    </>
  );
}
