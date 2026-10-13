import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchTasks } from "@/api/queries";
import { PageTitle } from "@/components/layout/PageTitle";

/** "Come funziona" (N3): a short guide always one click away, unlike the first-run examples. */
export function GuidePage() {
  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: ({ signal }) => fetchTasks(signal) });
  const creationTasks = (tasksQuery.data ?? []).filter((task) => task.group === "crea");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 text-sm text-ink">
      <PageTitle>Come funziona</PageTitle>
      <p className="text-base">
        Scegli il lavoro da fare, scrivi cosa vuoi vedere e premi Genera: l&apos;app usa da sola il modello adatto.
        Le immagini restano su questo computer.
      </p>

      <GuideSection title="Quale lavoro scegliere">
        <div className="overflow-x-auto" role="region" aria-label="Tabella dei lavori">
          <table className="w-full min-w-[32rem] text-left">
            <caption className="sr-only">Quale lavoro scegliere</caption>
            <thead>
              <tr className="border-b border-border text-ink-muted">
                <th scope="col" className="py-1 pr-3 font-medium">Lavoro</th>
                <th scope="col" className="py-1 pr-3 font-medium">A cosa serve</th>
                <th scope="col" className="py-1 pr-3 font-medium">Lingua</th>
                <th scope="col" className="py-1 font-medium">Tempo</th>
              </tr>
            </thead>
            <tbody>
              {creationTasks.map((task) => (
                <tr key={task.id} className="border-b border-border/50 align-top">
                  <th scope="row" className="py-2 pr-3 font-medium">{task.label}</th>
                  <td className="py-2 pr-3 text-ink-muted">{task.description}</td>
                  <td className="py-2 pr-3">{task.prompt_language.required === "en" ? "in inglese" : "anche in italiano"}</td>
                  <td className="py-2">{task.duration_hint ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-muted">
          Tempi misurati su una scheda video da 8 GB: il primo lavoro dopo l&apos;avvio, o dopo un cambio di tipo di
          lavoro, richiede qualche secondo in più.
        </p>
      </GuideSection>

      <GuideSection title="Perché a volte in inglese">
        <p>
          Alcuni modelli hanno imparato solo dall&apos;inglese: in italiano capiscono il soggetto ma perdono i dettagli.
          Sopra la descrizione l&apos;app dice sempre in che lingua scrivere. Se scrivi in italiano dove serve
          l&apos;inglese compare un avviso, con il passaggio a un lavoro che capisce l&apos;italiano.
        </p>
      </GuideSection>

      <GuideSection title="Continuare da un'immagine">
        <ul className="list-inside list-disc space-y-1">
          <li>
            <Link to="/modifica" className="text-accent-text underline">Modifica</Link>: scrivi cosa cambiare, colora
            la zona da rifare oppure aggiungi spazio ai lati.
          </li>
          <li>
            <Link to="/migliora" className="text-accent-text underline">Migliora</Link>: una versione simile, un&apos;immagine
            più grande, oppure il soggetto senza sfondo.
          </li>
          <li>
            <Link to="/galleria" className="text-accent-text underline">Galleria</Link>: ritrova le immagini, segna le
            preferite e da ognuna continua con Modifica, Migliora o un&apos;altra variante.
          </li>
        </ul>
      </GuideSection>

      <GuideSection title="Rifare un risultato uguale">
        <p>
          Ogni immagine ha un codice del risultato. Con lo stesso codice e la stessa descrizione ottieni
          un&apos;immagine quasi identica: lo trovi in Opzioni avanzate, su Crea, e nei dettagli tecnici della Galleria.
        </p>
      </GuideSection>

      <GuideSection title="Se qualcosa non va">
        <ul className="list-inside list-disc space-y-1">
          <li>
            Il motore si è fermato: dal menu delle applicazioni scegli &quot;Chiudi Image Generator&quot;, poi riapri
            &quot;Image Generator&quot;.
          </li>
          <li>Memoria della scheda video esaurita: prova un formato più piccolo o una sola immagine alla volta.</li>
          <li>Un altro programma usa la scheda video: chiudilo prima di generare.</li>
          <li>
            Disco quasi pieno: in <Link to="/impostazioni" className="text-accent-text underline">Impostazioni</Link>{" "}
            cancella le copie di lavoro del motore, oppure svuota il cestino della{" "}
            <Link to="/galleria?view=cestino" className="text-accent-text underline">Galleria</Link>.
          </li>
          <li>Un lavoro non è disponibile: manca un modello, e Impostazioni lo installa con un clic.</li>
        </ul>
      </GuideSection>
    </div>
  );
}

function GuideSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
