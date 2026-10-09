import sampleCsv from "../samples/westbrook-catalog.csv?raw";

export const SAMPLE_NAME = "westbrook-catalog.csv";

export function sampleFile(): File {
  return new File([sampleCsv], SAMPLE_NAME, { type: "text/csv" });
}

export function downloadText(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadSample(): void {
  downloadText(SAMPLE_NAME, sampleCsv, "text/csv");
}
