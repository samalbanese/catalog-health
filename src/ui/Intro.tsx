import { useRef, useState, type DragEvent } from "react";
import { downloadSample } from "../sample";

interface Props {
  busy: boolean;
  onFile: (file: File) => void;
  onSample: () => void;
}

export function Intro({ busy, onFile, onSample }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function drop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file && !busy) onFile(file);
  }

  return (
    <section className="intro" aria-labelledby="intro-title">
      <div className="intro-copy">
        <p className="dateline mono">Free · open source · runs in your browser</p>
        <h1 id="intro-title">
          Find what's broken in a product catalog <em>before a marketplace does.</em>
        </h1>
        <p className="lede">
          Drop in a marketplace product file. Every row is checked for broken variation families, missing
          attributes, duplicates, and title and bullet problems, then you get a score and a fix list.
        </p>
      </div>

      <div
        className={`drop${over ? " is-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
      >
        <p className="drop-title">Drop a CSV, TSV, or XLSX file</p>
        <p className="drop-sub mono">Flat files and listing reports both work. Nothing is uploaded.</p>
        <div className="drop-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onSample}>
            Try the sample catalog
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>
            Choose a file
          </button>
          <input
            ref={input}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xls"
            hidden
            data-testid="file-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onFile(file);
            }}
          />
        </div>
        <p className="drop-note">
          The sample is an invented apparel brand, Westbrook &amp; Co., with problems planted on purpose.{" "}
          <button type="button" className="link" onClick={downloadSample}>
            Download the sample file
          </button>
        </p>
      </div>
    </section>
  );
}
